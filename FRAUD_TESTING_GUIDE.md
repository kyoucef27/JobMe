# Fraud Detection Testing Guide

## Overview
This guide shows how to test all fraud detection features including **automatic AI-powered fraud analysis on every order**, buyer fraud detection, seller reporting, and admin fraud management.

**NEW: Fraud detection is now AUTOMATIC!** Every order creation triggers AI analysis without any extra API calls.

---

## Quick Start - Complete Testing Flow

### Step 1: Create User Account

**POST** `http://localhost:3000/api/users/signup`
```json
{
  "username": "testuser",
  "email": "your-email@gmail.com",
  "password": "TestPass123!",
  "fullname": "Test User"
}
```

You'll receive an OTP via email.

### Step 2: Verify OTP

**POST** `http://localhost:3000/api/users/verify-otp`
```json
{
  "email": "your-email@gmail.com",
  "otp": "123456"
}
```

**Save the JWT token from the response!**

### Step 3: Create a Gig

**POST** `http://localhost:3000/api/simplegigs`

Headers: `Authorization: Bearer YOUR_JWT_TOKEN`

```json
{
  "title": "Test Gig",
  "description": "Testing fraud detection",
  "category": "Programming & Tech",
  "price": 100,
  "deliveryTime": 3,
  "revisions": 2
}
```

**Save the gig `_id`!**

### Step 4: Create Order (Fraud Detection Runs Automatically!)

**POST** `http://localhost:3000/api/simpleorders`

Headers: `Authorization: Bearer YOUR_JWT_TOKEN`

```json
{
  "gigId": "YOUR_GIG_ID",
  "requirements": []
}
```

**Response includes automatic fraud analysis:**
```json
{
  "message": "Order created successfully",
  "order": { ... },
  "fraudAnalysis": {
    "riskScore": 75,
    "recommendation": "review",
    "flags": [...],
    "autoFlagged": true
  }
}
```

---

## Overview
This guide shows how to test all fraud detection features including buyer fraud analysis, seller reporting, and admin fraud management.

---

## Prerequisites

1. **Start your server**:
```bash
npm run dev
# or
npm start
```

2. **Test Data Needed**:
   - User IDs (buyers and sellers)
   - Order IDs
   - Admin authentication token (if authentication is enabled)

---

## Testing Scenarios

### 1. Test Automatic Buyer Fraud Detection

**Fraud detection now runs AUTOMATICALLY** when buyers create orders! The AI analyzes every order and returns a fraud risk assessment.

#### Step 1: Create a Gig First

**POST** `http://localhost:3000/api/simplegigs`

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_JWT_TOKEN`

Body:
```json
{
  "title": "Test Gig for Fraud Detection",
  "description": "Testing gig for fraud detection",
  "category": "Programming & Tech",
  "price": 100,
  "deliveryTime": 3,
  "revisions": 2
}
```

**Valid Categories:**
- `Graphics & Design`
- `Digital Marketing`
- `Writing & Translation`
- `Video & Animation`
- `Music & Audio`
- `Programming & Tech`
- `Data`
- `Business`
- `Lifestyle`

**Copy the gig `_id` from the response!**

---

#### Scenario A: New Account with Large Order (High Risk)

**POST** `http://localhost:3000/api/simpleorders`

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_JWT_TOKEN`

Body (High Risk - No Requirements):
```json
{
  "gigId": "69a0cc772b75c62ceac7acc9",
  "requirements": []
}
```

**Expected Response** includes:
```json
{
  "message": "Order created successfully",
  "order": { ... },
  "fraudAnalysis": {
    "riskScore": 75,
    "recommendation": "review",
    "flags": [
      {
        "type": "new_account",
        "severity": "high",
        "reason": "Account created less than 7 days ago"
      },
      {
        "type": "incomplete_requirements",
        "severity": "medium",
        "reason": "Order has no detailed requirements"
      }
    ],
    "autoFlagged": true
  }
}
```

---

#### Scenario B: Account with Order History (Medium Risk)

**POST** `http://localhost:3000/api/simpleorders`

Body (With Requirements):
```json
{
  "gigId": "YOUR_GIG_ID_HERE",
  "requirements": ["Detailed requirement 1", "Specific needs here"]
}
```

**Expected AI Response**: Medium risk score (30-60) if account has some history

---

#### Scenario C: Legitimate Order (Low Risk)

After your account ages and has completed orders:

```json
{
  "gigId": "YOUR_GIG_ID_HERE",
  "requirements": ["Very detailed requirement 1", "Clear specifications", "Expected deliverables"]
}
```

**Expected AI Response**: Low risk score (0-30), approved

---

### 2. Test Manual Fraud Flagging

#### Flag a User Manually (Admin or System)

**POST** `http://localhost:3000/api/fraud/flag`

Headers: `Content-Type: application/json`

Body:
```json
{
  "userId": "USER_ID_HERE",
  "orderId": "ORDER_ID_HERE",
  "reason": "Multiple suspicious orders with incomplete requirements",
  "aiAnalysis": {
    "riskScore": 85,
    "reasons": ["New account", "High-value orders", "Pattern of cancellations"],
    "recommendation": "reject"
  }
}
```

**Expected Response**:
```json
{
  "message": "User flagged as potential fraud",
  "fraudCase": {
    "id": "...",
    "user": "USER_ID",
    "fraudScore": 85,
    "status": "pending",
    "resolved": false,
    "flags": [
      {
        "type": "ai_detected",
        "severity": "high",
        "reason": "AI risk score above threshold",
        "detectedAt": "2026-02-26T..."
      }
    ]
  }
}
```

---

### 3. Test Buyer Report System (Report Sellers)

#### Submit a Report Against a Seller

**POST** `http://localhost:3000/api/reports/submit`

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_JWT_TOKEN`

Body:
```json
{
  "reportedUserId": "SELLER_USER_ID",
  "orderId": "ORDER_ID",
  "category": "non_delivery",
  "description": "Seller did not deliver the work after 2 weeks past deadline",
  "evidenceText": "I have payment proof and conversation screenshots"
}
```

**Valid Categories:**
- `non_delivery` - Seller didn't deliver
- `scam` - Fraudulent behavior
- `low_quality` - Poor quality work
- `fake_profile` - Fake credentials
- `harassment` - Inappropriate behavior
- `other` - Other issues

#### Submit Report with File Uploads (Postman)

**POST** `http://localhost:3000/api/reports/submit`

Headers:
- `Authorization: Bearer YOUR_JWT_TOKEN`

In Postman:
1. Select **Body** → **form-data**
2. Add these fields:
   - `reportedUserId` (Text): SELLER_USER_ID
   - `orderId` (Text): ORDER_ID
   - `category` (Text): scam
   - `description` (Text): Seller took payment and disappeared
   - `screenshots` (File): Click and select image files (you can add multiple)

**Expected Response**:
```json
{
  "message": "Report submitted successfully",
  "report": {
    "id": "...",
    "reporter": "...",
    "reportedUser": "65f_seller_id_here",
    "category": "scam",
    "status": "pending",
    "reporterCredibility": {
      "credibilityScore": 65,
      "isCredible": true
    },
    "sellerAutoFlagged": true,
    "fraudCaseId": "..."
  }
}
```

**Note**: If the reporter has good credibility (score ≥ 30) and the seller has multiple credible reports, the seller may be automatically flagged.

---

### 4. Test Fraud Status Check

#### Check if User is Flagged Before Transaction

**GET** `http://localhost:3000/api/fraud/check/USER_ID_HERE`

Replace `USER_ID_HERE` with actual user ID.

**Expected Response (Not Flagged)**:
```json
{
  "userId": "USER_ID",
  "isFlagged": false,
  "message": "User has no active fraud flags"
}
```

**Expected Response (Flagged)**:
```json
{
  "userId": "USER_ID",
  "isFlagged": true,
  "fraudScore": 85,
  "status": "pending",
  "recommendation": "Block user from transactions until reviewed",
  "details": {
    "flaggedAt": "2026-02-26T10:30:00Z",
    "reason": "AI detected suspicious pattern",
    "riskLevel": "high"
  }
}
```

---

### 5. Test Admin Fraud Management

#### Get All Fraud Cases

**GET** `http://localhost:3000/api/fraud/cases?status=pending&page=1&limit=10`

**Query Parameters:**
- `status`: `pending`, `under_review`, `confirmed`, `false_positive`
- `minScore`: Minimum fraud score (0-100)
- `maxScore`: Maximum fraud score (0-100)
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Examples:**
- All pending cases: `?status=pending`
- High risk only: `?minScore=70`
- Confirmed fraud: `?status=confirmed`

#### Get Specific Fraud Case Details

**GET** `http://localhost:3000/api/fraud/cases/FRAUD_CASE_ID`

**Expected Response**:
```json
{
  "fraudCase": {
    "id": "...",
    "user": {
      "id": "...",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "fraudScore": 85,
    "status": "pending",
    "aiAnalysis": {
      "model": "llama-4-maverick",
      "confidence": 0.92,
      "reasons": ["..."]
    },
    "flags": [...],
    "orders": [...],
    "createdAt": "..."
  }
}
```

#### Review a Fraud Case

**PUT** `http://localhost:3000/api/fraud/cases/FRAUD_CASE_ID/review`

Headers: `Content-Type: application/json`

Body:
```json
{
  "reviewedBy": "Admin John",
  "status": "confirmed",
  "decision": "ban",
  "notes": "Multiple confirmed fraudulent orders, permanent ban issued"
}
```

**Status Options:**
- `pending` - Not yet reviewed
- `under_review` - Being investigated
- `confirmed` - Fraud confirmed
- `false_positive` - Not fraud

**Decision Options:**
- `ban` - Permanent ban
- `warn` - Warning issued
- `monitor` - Watch for further activity
- `no_action` - No action needed

#### Resolve a Fraud Case

**PUT** `http://localhost:3000/api/fraud/cases/FRAUD_CASE_ID/resolve`

Headers: `Content-Type: application/json`

Body:
```json
{
  "resolution": "User banned permanently",
  "actionTaken": "Account suspended, refunds issued to affected sellers",
  "preventiveMeasures": "Enhanced verification for similar patterns"
}
```

#### Add Notes to Fraud Case

**POST** `http://localhost:3000/api/fraud/cases/FRAUD_CASE_ID/notes`

Headers: `Content-Type: application/json`

Body:
```json
{
  "note": "Contacted user via email, no response after 72 hours",
  "addedBy": "Admin John"
}
```

#### Get Fraud Statistics

**GET** `http://localhost:3000/api/fraud/statistics`

**Expected Response**:
```json
{
  "stats": {
    "total": 45,
    "pending": 12,
    "underReview": 8,
    "confirmed": 20,
    "falsePositives": 5,
    "averageScore": 67.5,
    "highRiskCases": 15,
    "last24h": {
      "newCases": 3,
      "resolved": 2
    }
  }
}
```

---

### 6. Test Report Management

#### Get All Reports (Admin)

**GET** `http://localhost:3000/api/reports/all?status=pending&page=1&limit=10`

**Query Parameters:**
- `status`: `pending`, `under_review`, `resolved`, `dismissed`
- `page`: Page number
- `limit`: Results per page

#### Get Reports Against a Specific Seller

**GET** `http://localhost:3000/api/reports/seller/SELLER_USER_ID`

**Expected Response**:
```json
{
  "sellerId": "SELLER_USER_ID",
  "reports": [...],
  "total": 5,
  "stats": {
    "pending": 2,
    "resolved": 3,
    "averageCredibility": 72.5
  }
}
```

#### Review a Report (Admin)

**PUT** `http://localhost:3000/api/reports/REPORT_ID/review`

Headers: `Content-Type: application/json`

Body:
```json
{
  "status": "resolved",
  "action": "user_warned",
  "notes": "Verified the complaint, seller warned and monitored"
}
```

**Action Options:**
- `user_banned` - User permanently banned
- `user_warned` - Warning issued
- `user_suspended` - Temporary suspension
- `no_action` - No action taken
- `refund_issued` - Refund processed

#### Get My Reports (As a Reporter)

**GET** `http://localhost:3000/api/reports/my-reports`

Headers: `Authorization: Bearer YOUR_JWT_TOKEN`

---

## Test Scenarios with Expected Outcomes

### Scenario 1: New Buyer Makes Suspicious Order

**Steps**:
1. Create a new user account (< 7 days old)
2. Place a high-value order ($1000+) with no requirements
3. Check the order response for fraud analysis

**Expected Outcome**:
- Order created but flagged
- Fraud score: 75-90
- Recommendation: Review
- Automatic fraud case created
- Seller notified to proceed with caution

---

### Scenario 2: Multiple Credible Reports Against Seller

**Steps**:
1. Submit 3 reports from credible buyers (score ≥ 30, fraud score < 50, 3+ completed orders)
2. Each report describes non-delivery or scam
3. Check seller's fraud status

**Expected Outcome**:
- After 2nd or 3rd credible report, seller is auto-flagged
- Fraud case created with seller's info
- Fraud score calculated based on report severity
- Admin receives notification to review

---

### Scenario 3: False Positive - Legitimate Large Order

**Steps**:
1. Trusted buyer (account age > 90 days, 20+ orders, 0 fraud score) places $2000 order
2. Buyer provides detailed requirements
3. Check fraud analysis

**Expected Outcome**:
- Low risk score (0-30)
- Recommendation: Approve
- No fraud case created
- Order proceeds normally

---

### Scenario 4: Admin Reviews and Resolves Fraud Case

**Steps**:
1. Admin gets fraud case from `/api/fraud/cases?status=pending`
2. Reviews evidence and orders
3. Updates status to "confirmed"
4. Adds resolution notes
5. Resolves the case

**Expected Outcome**:
- Case status updated
- Resolution recorded with timestamp
- User account can be suspended/banned
- Audit trail maintained

---

## Testing with Postman

### Import Collection
Create a Postman collection with these endpoints:

1. **Fraud Detection**
   - POST `/api/fraud/flag`
   - GET `/api/fraud/check/:userId`
   - GET `/api/fraud/cases`
   - GET `/api/fraud/cases/:id`
   - PUT `/api/fraud/cases/:id/review`
   - PUT `/api/fraud/cases/:id/resolve`
   - POST `/api/fraud/cases/:id/notes`
   - GET `/api/fraud/statistics`

2. **Reports**
   - POST `/api/reports/submit` (with file upload)
   - GET `/api/reports/all`
   - GET `/api/reports/:id`
   - GET `/api/reports/seller/:sellerId`
   - GET `/api/reports/my-reports`
   - PUT `/api/reports/:id/review`

### Environment Variables
```json
{
  "baseUrl": "http://localhost:3000",
  "userId": "your_test_user_id",
  "orderId": "your_test_order_id",
  "fraudCaseId": "your_test_fraud_case_id",
  "reportId": "your_test_report_id"
}
```

---

## Monitoring AI Responses

### Check Server Logs
The fraud detection service logs AI analysis:

```bash
# Watch server logs
tail -f server.log

# Look for entries like:
# [Fraud Detection] Analyzing order for buyer: 65f...
# [AI Response] Risk Score: 85, Recommendation: review
# [Fraud Detection] User auto-flagged: true
```

### Database Checks

#### Check Fraud Cases
```javascript
// MongoDB Shell
db.fraudusers.find({ resolved: false }).pretty()
db.fraudusers.find({ fraudScore: { $gte: 70 } }).pretty()
```

#### Check Reports
```javascript
db.reports.find({ status: "pending" }).pretty()
db.reports.find({ "reporterCredibility.isCredible": true }).pretty()
```

---

## Troubleshooting

### Issue: AI Not Flagging Obvious Fraud
**Solution**: Check GROQ_API_KEY in .env file, verify API quota

### Issue: Reports Not Auto-Flagging Sellers
**Solution**: Check reporter credibility scores (need score ≥ 30, fraud score < 50, 3+ orders)

### Issue: Fraud Cases Not Created
**Solution**: Check server logs for errors, verify MongoDB connection

### Issue: File Uploads Failing
**Solution**: Check Cloudinary credentials (CLOUDINARY_KEY, CLOUDINARY_SECRET)

---

## Performance Testing

### Load Test Fraud Detection
```bash
# Test 100 concurrent fraud checks
ab -n 100 -c 10 http://localhost:3000/api/fraud/check/65f1234567890abcdef12345

# Test report submissions
ab -n 50 -c 5 -p report.json -T application/json http://localhost:3000/api/reports/submit
```

---

## Best Practices

1. **Test with Real-World Data**: Use realistic order values, user histories, and descriptions
2. **Test Edge Cases**: Very new accounts, very old accounts, extreme prices, no requirements
3. **Test Credibility System**: Verify reporters need good scores to auto-flag sellers
4. **Monitor AI Responses**: Check if AI reasoning makes sense for each scenario
5. **Test Admin Workflow**: Full cycle from detection → review → resolution
6. **Test File Uploads**: Submit reports with various image formats and sizes

---

## Quick Test Script

Save this as `test-fraud.sh`:

```bash
#!/bin/bash
API="http://localhost:3000"

echo "1. Testing fraud check for user..."
curl -s "$API/api/fraud/check/65f1234567890abcdef12345" | jq

echo "\n2. Getting fraud statistics..."
curl -s "$API/api/fraud/statistics" | jq

echo "\n3. Getting all fraud cases..."
curl -s "$API/api/fraud/cases?limit=5" | jq

echo "\n4. Getting all reports..."
curl -s "$API/api/reports/all?limit=5" | jq

echo "\nTests completed!"
```

Run with: `bash test-fraud.sh`

---

## Next Steps

1. **Enable Authentication**: Uncomment middleware in routes for production security
2. **Add Admin UI**: Build dashboard for reviewing fraud cases and reports
3. **Set Up Alerts**: Email/SMS notifications for high-risk fraud cases
4. **Monitor Metrics**: Track false positive rate, detection accuracy
5. **Tune AI Prompts**: Adjust thresholds based on real-world performance
