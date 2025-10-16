# 💸 Send Feature Documentation

## Overview

The `/send` command allows users to send USDC to other registered users on the bot. This is a peer-to-peer transfer feature that uses Hyperliquid's `usdSend` function.

## Usage

### Fast Mode
```
/send @username 10
/send username 10
/send 123456789 10
```

### Interactive Mode
```
/send
```
Then follow the prompts:
1. Enter recipient (username or telegram ID)
2. Enter amount
3. Confirm the transfer

## Features

✅ **Search by username or Telegram ID**
- Supports `@username`, `username`, or telegram ID
- Case-insensitive username matching

✅ **Minimum amount: 5 USDC**

✅ **Validations:**
- Recipient must be registered on the bot
- Cannot send to yourself
- Sufficient balance check
- Telegram ID verification in confirmation

✅ **Confirmation screen:**
Shows recipient details including:
- Display name (@username or User_ID)
- Telegram ID (for verification)
- Wallet address (truncated)
- Amount and balance after send

✅ **Notifications:**
- Sender receives success confirmation
- Recipient automatically receives notification

✅ **No fees** (uses HyperCore network)

## Example Flow

### User sends 10 USDC to @john

```
User: /send @john 10

Bot: 💸 Send USDC - Confirmation

To: @john
Telegram ID: 123456789
Wallet: 0x1234...5678

Amount: 10.00 USDC

Your balance: 50.00 USDC
After send: 40.00 USDC

⚠️ Double-check the recipient before confirming!

[✅ Confirm Send] [❌ Cancel] [🏠 Menu]
```

```
User clicks: ✅ Confirm Send

Bot: ⏳ Processing transfer...

Bot: ✅ Transfer successful! 🎉

Sent 10.00 USDC to @john
Transaction completed on HyperCore

[💰 Check Balance] [🏠 Menu]
```

### Recipient (@john) receives notification

```
Bot: ✅ You received USDC! 🎁

From: @sender
Amount: 10.00 USDC

The funds are now in your wallet.

[💰 Check Balance] [🏠 Menu]
```

## Error Handling

### Recipient not found
```
❌ Recipient not found: @unknown

Make sure they are registered on this bot.
```

### Insufficient balance
```
❌ Insufficient balance.

Your balance: 5.00 USDC
Required: 10.00 USDC
```

### Amount too low
```
❌ Minimum send amount is 5 USDC.
```

### Self-transfer attempt
```
❌ You cannot send USDC to yourself! 😅
```

## Technical Details

### Files Created
1. **`/backend/src/db/getUserByIdentifier.js`**
   - Function to search users by username or telegram_id
   - Case-insensitive username matching
   - Display name helper function

2. **`/backend/src/bot/send.js`**
   - Main handler for `/send` command
   - Fast mode and interactive mode support
   - Confirmation flow with session management
   - Transfer execution and notifications

### Files Modified
1. **`/backend/src/bot/handlers.js`**
   - Added import for `registerSendHandler`
   - Registered send handler with bot

2. **`/backend/src/index.js`**
   - Added `/send` command to bot menu

3. **`/backend/src/bot/help.js`**
   - Added `/send` to account commands section

### Session Management
- Uses existing `sessionManager` system
- Flow type: `"send"`
- Steps:
  1. `awaiting_recipient` (interactive mode)
  2. `awaiting_amount` (interactive mode)
  3. `awaiting_confirmation` (both modes)

### Transaction Flow
1. Parse command or start interactive flow
2. Validate recipient existence
3. Check sender balance
4. Show confirmation with all details
5. Execute transfer via `coreWithdraw()` (usdSend)
6. Notify both sender and recipient
7. Clear session

## Security Considerations

✅ **Username verification:** Shows Telegram ID in confirmation to prevent username confusion

✅ **Double confirmation:** User must explicitly confirm before transfer

✅ **Balance checks:** Multiple balance validations (before and during transfer)

✅ **Session isolation:** Uses session manager to prevent concurrent operations

✅ **Error logging:** All transfers logged with sender, recipient, and amount

## Testing Checklist

### Basic functionality
- [ ] Fast mode: `/send @user 10`
- [ ] Interactive mode: `/send`
- [ ] Username search (with and without @)
- [ ] Telegram ID search

### Validations
- [ ] Minimum amount (5 USDC)
- [ ] Insufficient balance
- [ ] Recipient not found
- [ ] Self-transfer prevention
- [ ] Invalid amount (negative, text, etc.)

### Edge cases
- [ ] Case-insensitive username matching
- [ ] User with no username (User_ID format)
- [ ] Concurrent session handling
- [ ] Recipient notification failure (graceful degradation)

### User experience
- [ ] Confirmation shows correct details
- [ ] Success message displays properly
- [ ] Recipient receives notification
- [ ] Cancel button works
- [ ] Back to menu works

## Future Enhancements (Optional)

🔮 **Potential additions:**
- Transfer history log table
- Daily/weekly send limits
- Transaction fees (if needed)
- Batch sends
- Request money feature
- Transfer privacy settings

## Support

If users encounter issues:
1. Check both sender and recipient are registered (`/start`)
2. Verify sufficient balance (`/balance`)
3. Confirm correct username or telegram ID
4. Check minimum amount requirement (5 USDC)

