const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let client = null;
let isAddingActive = false;
let shouldStopAdding = false;

// Initialize WhatsApp Web Client
function initWhatsAppClient() {
  if (client) {
    try {
      client.destroy();
    } catch (e) {
      console.error('Error destroying client:', e);
    }
  }

  io.emit('log', { message: 'Initializing WhatsApp Web engine (Chromium)...', type: 'info' });

  const puppeteerOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: puppeteerOptions
  });

  client.on('qr', async (qr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(qr);
      io.emit('qr', qrDataUrl);
      io.emit('log', { message: 'New QR Code generated. Scan from your phone.', type: 'info' });
    } catch (err) {
      console.error('QR code generation error:', err);
    }
  });

  client.on('ready', () => {
    console.log('WhatsApp Web Client is ready!');
    io.emit('ready');
    io.emit('log', { message: 'WhatsApp session connected successfully!', type: 'success' });
  });

  client.on('authenticated', () => {
    io.emit('log', { message: 'Session authenticated.', type: 'info' });
  });

  client.on('auth_failure', (msg) => {
    io.emit('disconnected', msg);
    io.emit('log', { message: `Authentication failure: ${msg}`, type: 'error' });
  });

  client.on('disconnected', (reason) => {
    io.emit('disconnected', reason);
    io.emit('log', { message: `Disconnected: ${reason}`, type: 'error' });
  });

  client.initialize().catch((err) => {
    console.error('Initialization error:', err);
    io.emit('log', { message: `Client init error: ${err.message}`, type: 'error' });
  });
}

// REST Endpoints
app.get('/api/groups', async (req, res) => {
  if (!client || !client.pupPage) {
    return res.status(400).json({ success: false, error: 'WhatsApp client is still initializing. Please wait a moment.' });
  }

  try {
    const groups = await client.pupPage.evaluate(() => {
      try {
        if (!window.require) return null;
        const collections = window.require('WAWebCollections');
        if (!collections || !collections.Chat) return null;
        const models = collections.Chat.getModelsArray();
        return models
          .filter((c) => c && (c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us'))))
          .map((c) => ({
            id: c.id ? c.id._serialized : '',
            name: c.formattedTitle || c.name || (c.contact ? c.contact.name : 'Unnamed Group'),
            participantsCount: c.groupMetadata && c.groupMetadata.participants ? c.groupMetadata.participants.length : 0
          }))
          .filter((g) => g.id);
      } catch (innerErr) {
        return null;
      }
    });

    if (!groups) {
      return res.status(503).json({ success: false, error: 'WhatsApp Web is still loading chat data. Please retry in a few seconds.' });
    }

    res.json({ success: true, groups });
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ success: false, error: err.message || err.toString() });
  }
});

app.post('/api/start-add', async (req, res) => {
  const { groupId, numbers, delaySeconds = 8, batchSize = 1 } = req.body;

  if (isAddingActive) {
    return res.status(400).json({ success: false, error: 'An addition task is already running' });
  }
  if (!groupId || !numbers || !numbers.length) {
    return res.status(400).json({ success: false, error: 'Invalid parameters provided' });
  }

  isAddingActive = true;
  shouldStopAdding = false;
  res.json({ success: true, message: 'Process started' });

  // Execute background addition process
  (async () => {
    try {
      // 1. Get group basic info directly without triggering getChatById/getChatModel serialization
      const groupInfo = await client.pupPage.evaluate((gId) => {
        try {
          const chatCollection = window.require('WAWebCollections').Chat;
          const chat = chatCollection ? chatCollection.get(gId) : null;
          return {
            name: chat ? (chat.formattedTitle || chat.name || 'WhatsApp Group') : 'WhatsApp Group',
            isAdmin: chat && chat.iAmAdmin ? chat.iAmAdmin() : true
          };
        } catch (e) {
          return { name: 'WhatsApp Group', isAdmin: true };
        }
      }, groupId);

      const total = numbers.length;
      let processed = 0;

      io.emit('progress', { current: 0, total });
      io.emit('log', { message: `Target group: "${groupInfo.name}". Total numbers: ${total}`, type: 'info' });

      for (let i = 0; i < total; i += batchSize) {
        if (shouldStopAdding) {
          io.emit('log', { message: 'Process was manually stopped by user.', type: 'warning' });
          break;
        }

        const batch = numbers.slice(i, i + batchSize);

        for (const rawNumber of batch) {
          if (shouldStopAdding) break;

          const cleanNum = rawNumber.replace(/\D/g, '');
          const participantId = `${cleanNum}@c.us`;

          io.emit('log', { message: `Adding +${cleanNum}...`, type: 'info' });

          try {
            // Direct participant add via WhatsApp internal RPC
            const result = await client.pupPage.evaluate(async (gId, pId) => {
              try {
                const groupWid = window.require('WAWebWidFactory').createWid(gId);
                const participantWid = window.require('WAWebWidFactory').createWid(pId);

                // Check if user exists on WhatsApp
                const exists = await window.require('WAWebQueryExistsJob').queryWidExists(participantWid);
                if (!exists || !exists.wid) {
                  return { code: 404, message: 'Number is not registered on WhatsApp' };
                }

                // Call the add RPC
                const rpc = await window.WWebJS.getAddParticipantsRpcResult(groupWid, participantWid);
                const code = rpc ? rpc.code : 400;

                const codeMessages = {
                  200: 'The participant was added successfully',
                  403: 'Privacy settings require an invite link (Sent invite link)',
                  404: 'The phone number is not registered on WhatsApp',
                  408: 'Recently left the group; cannot add directly',
                  409: 'Already a group member',
                  417: 'Cannot be added to community directly',
                  419: 'Group is full'
                };

                return {
                  code: code || 200,
                  message: codeMessages[code] || (code === 200 ? 'Successfully added' : `Result code ${code}`)
                };
              } catch (evalErr) {
                return { code: 500, message: evalErr.message || evalErr.toString() };
              }
            }, groupId, participantId);

            if (result.code === 200) {
              io.emit('log', { message: `+${cleanNum}: Successfully added to group!`, type: 'success' });
            } else if (result.code === 403) {
              io.emit('log', { message: `+${cleanNum}: Privacy restricted. Sent group invite.`, type: 'warning' });
            } else if (result.code === 409) {
              io.emit('log', { message: `+${cleanNum}: Already a group member.`, type: 'info' });
            } else if (result.code === 404) {
              io.emit('log', { message: `+${cleanNum}: Not registered on WhatsApp.`, type: 'error' });
            } else {
              io.emit('log', { message: `+${cleanNum}: ${result.message}`, type: 'warning' });
            }
          } catch (numErr) {
            io.emit('log', { message: `+${cleanNum} failed: ${numErr.message}`, type: 'error' });
          }

          processed++;
          io.emit('progress', { current: processed, total });

          // Inter-number pacing
          if (processed < total && !shouldStopAdding) {
            io.emit('log', { message: `Waiting ${delaySeconds}s (anti-ban pacing)...`, type: 'info' });
            await new Promise((r) => setTimeout(r, delaySeconds * 1000));
          }
        }
      }
    } catch (err) {
      console.error('Fatal execution error:', err);
      io.emit('log', { message: `Fatal execution error: ${err.message || err.toString()}`, type: 'error' });
    } finally {
      isAddingActive = false;
      shouldStopAdding = false;
      io.emit('completed');
    }
  })();
});

app.post('/api/stop-add', (req, res) => {
  shouldStopAdding = true;
  res.json({ success: true, message: 'Stop signal sent' });
});

let isMessagingActive = false;
let shouldStopMessaging = false;

app.post('/api/send-bulk', async (req, res) => {
  const { targetType, targets, message, delaySeconds = 6 } = req.body;

  if (isMessagingActive) {
    return res.status(400).json({ success: false, error: 'A messaging task is already running' });
  }
  if (!targets || !targets.length) {
    return res.status(400).json({ success: false, error: 'No recipients provided' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Message cannot be empty' });
  }

  isMessagingActive = true;
  shouldStopMessaging = false;
  res.json({ success: true, message: 'Bulk messaging started' });

  (async () => {
    try {
      const total = targets.length;
      let sentCount = 0;
      io.emit('progress', { current: 0, total });
      io.emit('log', { message: `Started sending messages to ${total} ${targetType === 'groups' ? 'groups' : 'numbers'}...`, type: 'info' });

      for (let i = 0; i < total; i++) {
        if (shouldStopMessaging) {
          io.emit('log', { message: 'Messaging process stopped by user.', type: 'warning' });
          break;
        }

        const target = targets[i];
        let chatId = '';
        let displayName = '';

        if (targetType === 'groups') {
          chatId = target.id;
          displayName = target.name || target.id;
        } else {
          const cleanNum = target.replace(/\D/g, '');
          chatId = `${cleanNum}@c.us`;
          displayName = `+${cleanNum}`;
        }

        try {
          io.emit('log', { message: `Sending to ${displayName}...`, type: 'info' });
          await client.sendMessage(chatId, message);
          io.emit('log', { message: `Message delivered to ${displayName}`, type: 'success' });
          sentCount++;
        } catch (sendErr) {
          io.emit('log', { message: `Failed for ${displayName}: ${sendErr.message}`, type: 'error' });
        }

        io.emit('progress', { current: i + 1, total });

        // Safe pacing between messages
        if (i + 1 < total && !shouldStopMessaging) {
          io.emit('log', { message: `Waiting ${delaySeconds}s before next message...`, type: 'info' });
          await new Promise((r) => setTimeout(r, delaySeconds * 1000));
        }
      }

      io.emit('log', { message: `Bulk message run finished. (${sentCount}/${total} sent successfully)`, type: 'success' });
    } catch (err) {
      console.error('Fatal messaging error:', err);
      io.emit('log', { message: `Fatal messaging error: ${err.message}`, type: 'error' });
    } finally {
      isMessagingActive = false;
      shouldStopMessaging = false;
      io.emit('completed');
    }
  })();
});

app.post('/api/stop-send', (req, res) => {
  shouldStopMessaging = true;
  res.json({ success: true, message: 'Stop messaging signal sent' });
});

app.post('/api/restart', (req, res) => {
  initWhatsAppClient();
  res.json({ success: true, message: 'Client restarting' });
});

app.post('/api/logout', async (req, res) => {
  try {
    io.emit('log', { message: 'Logging out and resetting session...', type: 'warning' });
    if (client) {
      try {
        await client.logout();
      } catch (logoutErr) {
        console.warn('client.logout() notice:', logoutErr.message);
      }
      try {
        await client.destroy();
      } catch (destroyErr) {
        console.warn('client.destroy() notice:', destroyErr.message);
      }
      client = null;
    }

    // Clear saved auth directory
    const authDir = path.join(__dirname, '.wwebjs_auth');
    const fs = require('fs');
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    io.emit('disconnected', 'Logged out successfully');
    io.emit('log', { message: 'Logged out. Initializing fresh QR session...', type: 'info' });

    // Re-initialize to prompt a clean QR code
    initWhatsAppClient();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

io.on('connection', (socket) => {
  // If client is already ready when frontend reconnects
  if (client && client.info) {
    socket.emit('ready');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  initWhatsAppClient();
});
