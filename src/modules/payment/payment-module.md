# 💳 Payment Module Documentation

The `payment` module handles billing account management, payment processing, receipts, and transaction operations for Tapestry subscriptions. It integrates with Stripe for payment processing.

## 📁 Module Structure

```
modules/payment
├── handlers/    # Business logic for billing, receipts, and transactions
├── models/      # Mongoose schemas for billing accounts, receipts, transactions
├── routes/      # Express routes mounted at /api/v1/payment
│   ├── index.ts         # Billing account routes
│   ├── receipts.ts      # Receipt routes
│   └── transactions.ts  # Transaction processing routes
├── services/    # PaymentService, ReceiptService, TransactionService
├── classes/     # Shared payment domain classes
├── factory/     # Payment object factories
├── cron/        # Scheduled payment jobs
└── utils/       # Payment utilities
```

---

## 🚦 Routes

### Billing Accounts — `/api/v1/payment`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Service health check |
| `GET` | `/:id` | Yes | Fetch a billing account by ID |
| `POST` | `/:id` | Yes | Update a billing account by ID |

### Receipts — `/api/v1/payment/receipt`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | Yes | List receipts for the authenticated user |
| `GET` | `/:id` | Yes | Get a single receipt |
| `GET` | `/payment-statistics/:billingAccountId` | Yes | Get payment statistics for a billing account |

### Transactions — `/api/v1/payment/transactions`

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `POST` | `/:id/process-transaction` | Yes | Any | Process a payment transaction |
| `POST` | `/:id/refund-transaction` | Yes | Any | Issue a refund on a transaction |
| `POST` | `/:id/void-transaction` | Yes | Any | Void a pending transaction |
| `POST` | `/trigger-scheduled-payments` | Yes | `admin`, `internal` | Manually trigger scheduled payment processing |

---

## 🧪 Testing the Endpoints

```http
GET  /api/v1/payment/health
GET  /api/v1/payment/receipt
POST /api/v1/payment/transactions/:id/process-transaction
```

Authentication uses bearer tokens. The `trigger-scheduled-payments` endpoint requires admin or internal role.

---

## 📌 Notes

- The payment module integrates with **Stripe**. Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in your `.env` file.
- Billing accounts are created automatically during user registration for billable roles.
- Receipts and transaction records are stored in MongoDB for audit purposes.
- Scheduled payments can be triggered manually via the admin-only endpoint or run automatically via the cron job in `payment/cron/`.
