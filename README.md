# WhatsApp Automation Hub

> **Developed by Sharief**

A web application that allows you to bulk-add phone numbers into WhatsApp groups and send bulk broadcast messages, complete with anti-ban delay pacing and real-time logs.

---

## Features
- **QR Code Web Login**: Quick session sync using WhatsApp Web. Session stays remembered in `./.wwebjs_auth`.
- **Target Group Selector**: Automatically lists all WhatsApp groups where you belong.
- **Multiple Input Methods**:
  - Direct paste (line-by-line or comma-separated).
  - Excel/CSV upload (`.xlsx`, `.xls`, `.csv`).
- **Anti-Ban Safety Controls**:
  - Configurable delay (seconds) between adds.
  - Configurable batch size.
- **Smart Privacy Fallback**:
  - Automatically sends private group invite links if a user has configured privacy restrictions against being added directly.
- **Live Terminal & Progress Bar**:
  - Real-time status logs of who was added, who received invites, and any errors.

---

## Quick Start

1. Start the server:
   ```bash
   node server.js
   ```
2. Open your browser at:
   ```
   http://localhost:3000
   ```
3. Scan the QR code shown on the screen using your WhatsApp app (**Settings > Linked Devices > Link a Device**).
4. Select your target group from the dropdown.
5. Paste or upload your contact numbers, configure pacing, and click **Start Adding Members**.
