# Aetos Real-Time Delivery Tracking - Feature Specification & Architecture

**Version:** 1.0  
**Date:** September 13, 2024  
**Status:** Phase 2 Implementation  
**Document Type:** Complete Technical Specification with Diagrams, Workflows, and APIs

---

## Table of Contents
1. System Overview & Vision
2. Real-Time Delivery Tracking System Architecture
3. Delivery Partners & Ratings System
4. Complete User Workflows with Diagrams
5. Live GPS & Location Services
6. Notification System Architecture
7. Database Schema & API Design
8. Performance & SLA Metrics
9. Compliance & Data Security
10. Rollout Plan & Timeline
11. Expected Outcomes & Business Metrics

---

## 1. System Overview & Vision

### 1.1 Purpose
The Real-Time Delivery Tracking system provides users with complete transparency and control over medicine and lab sample deliveries. Users can:

- **Live GPS Tracking**: See delivery partner location in real-time
- **ETA Predictions**: Accurate delivery time estimates
- **Status Timeline**: Complete delivery journey with timestamps
- **Partner Communication**: Direct contact with delivery partner
- **Notifications**: Multi-channel alerts for status changes
- **History**: Access to past deliveries and tracking data

### 1.2 Key Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Live GPS Tracking** | Real-time location updates every 30 seconds | Users know exactly where delivery is |
| **ETA Calculation** | Machine learning based on historical data | Accurate time predictions |
| **Delivery Partner Profiles** | Ratings, reviews, on-time %age | User confidence in delivery quality |
| **Multi-Channel Notifications** | SMS, Push, Email, In-App | Users never miss critical updates |
| **Status Timeline** | Visual journey of order with timestamps | Complete transparency |
| **Contact Delivery Partner** | Direct phone/chat with driver | Issue resolution capability |
| **Order Filtering** | By status, type, date range | Easy discovery of orders |
| **Historical Tracking** | Access past deliveries | Compliance and audit trail |

### 1.3 Delivery Types Supported

#### Type 1: Medicine Delivery
- **Source**: Pharmacy partner
- **Partner**: Delivery agent (employee or contractor)
- **Items**: Medicines, prescriptions, refills
- **Special Handling**: Fragile, temperature-sensitive items
- **Average Delivery Time**: 30-90 minutes from pickup
- **Delivery Window**: 2-4 hour slots or express 30-minute

#### Type 2: Lab Sample Collection
- **Source**: Lab collection center or home
- **Partner**: Lab technician/phlebotomist
- **Items**: Blood, saliva, urine samples
- **Special Handling**: Biohazard container, temperature control
- **Average Delivery Time**: 10-30 minutes collection + 2-4 hours lab transport
- **Delivery Window**: Scheduled slot-based (morning 6-10 AM preferred)

---

## 2. Real-Time Delivery Tracking System Architecture

### 2.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AETOS TRACKING SYSTEM                       │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Web App    │         │ Mobile App   │         │ Delivery App │
│  (Frontend)  │         │  (Frontend)  │         │  (Real-time) │
└──────────────┘         └──────────────┘         └──────────────┘
       │                       │                         │
       └───────────────────────┼─────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   API Gateway       │
                    │  (Load Balancer)    │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   ┌────▼────┐         ┌──────▼────────┐      ┌─────▼──────┐
   │ Tracking│         │  GPS Service  │      │ Notification
   │  REST   │         │  (Real-time)  │      │   Service  │
   │ API     │         │               │      │            │
   └────┬────┘         └────┬──────────┘      └─────┬──────┘
        │                   │                       │
   ┌────┴──────────────────┴───────────────────────┴────┐
   │          Message Queue (Redis/RabbitMQ)          │
   │  (Real-time events, SMS, Push notifications)     │
   └────┬──────────────────────────────────────────────┘
        │
   ┌────┴──────────────────────────────────────────┐
   │                                               │
   ▼                                               ▼
┌──────────────┐                        ┌──────────────────┐
│  PostgreSQL  │                        │ MongoDB/Firebase │
│  (Orders,    │                        │ (Real-time GPS   │
│   Users,     │                        │  coordinates,    │
│   Partners)  │                        │  timestamps)     │
└──────────────┘                        └──────────────────┘
   │
   ▼
┌──────────────────────┐
│ Cache Layer (Redis) │
│ (Order data,        │
│  Partner status)    │
└──────────────────────┘

External Services:
- Google Maps API (Routing, distance, ETA)
- Twilio (SMS delivery)
- Firebase Cloud Messaging (Push notifications)
- SendGrid (Email notifications)
- AWS S3 (GPS tracking data archival)
```

### 2.2 Data Flow for Live GPS Tracking

```
Delivery Partner App                  Backend Services                   User App
        │                                    │                               │
        │ 1. GPS Location (every 30s)        │                               │
        ├──────────────────────────────────>│                               │
        │    {lat, lng, timestamp}           │                               │
        │                                    │ 2. Calculate distance/ETA      │
        │                                    │    & validate accuracy         │
        │                                    │                               │
        │                                    │ 3. Store in NoSQL DB           │
        │                                    │    (timestamp-indexed)         │
        │                                    │                               │
        │                                    │ 4. Publish to WebSocket/      │
        │                                    │    Server-Sent Events         │
        │                                    │                               │
        │                                    ├──────────────────────────────>│
        │                                    │ 5. Update map in real-time    │
        │                                    │                               │
        │                                    │ 6. Check if near destination   │
        │                                    │    or estimated arrival       │
        │                                    │                               │
        │                                    ├── Trigger notifications ─────>│
        │                                    │    (SMS/Push/Email)           │
        │                                    │                               │
        └─ Every 30 seconds ─────────────────┘                               │
```

### 2.3 Delivery Status States & Transitions

```
                    Order Placed
                         │
                         ▼
                  ┌───────────────┐
                  │ Pending       │
                  │ Pickup Ready  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Picked Up by  │
                  │ Delivery      │
                  │ Partner       │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ In Transit    │
                  │ (On the way)  │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Out for       │
                  │ Delivery      │
                  │ (Within 1 km) │
                  └───────┬───────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   Delivered       Delivery Failed    Returned
   (Completed)     (Exception)        to Sender
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                          ▼
                   Delivery Closed
                   (Final Status)
```

---

## 3. Delivery Partners & Ratings System

### 3.1 Partner Tier Structure

#### Tier 1: Premium Partners (Top 10%)
- **Criteria**: 
  - 4.8+ star rating
  - 98%+ on-time delivery
  - <0.5% damage/loss rate
  - 1000+ successful deliveries
- **Capabilities**:
  - Express delivery (30-minute slot)
  - Special handling (fragile items)
  - Same-day delivery for medicines
  - Priority assignment
  - Temperature-controlled vehicles
- **Average Delivery Time**: 45 minutes
- **Cancellation Rate**: <1%
- **Incentive**: 15-20% higher commission

#### Tier 2: Standard Partners (Next 60%)
- **Criteria**:
  - 4.5+ star rating
  - 95%+ on-time delivery
  - <2% damage/loss rate
  - 500+ successful deliveries
- **Capabilities**:
  - Regular delivery (2-4 hour slots)
  - Standard handling
  - Next-day delivery available
  - GPS tracking
- **Average Delivery Time**: 60 minutes
- **Cancellation Rate**: <2%
- **Incentive**: Standard commission (10-15%)

#### Tier 3: Emerging Partners (Newer, <60%)
- **Criteria**:
  - 4.0+ star rating
  - 90%+ on-time delivery
  - <3% damage/loss rate
  - 100+ successful deliveries
- **Capabilities**:
  - Standard delivery
  - Limited time slots
  - Training period: 6 months
  - Performance review quarterly
- **Average Delivery Time**: 75 minutes
- **Cancellation Rate**: <3%
- **Incentive**: Lower commission (5-10%), performance bonus

### 3.2 Partner Performance Metrics

```
Partner: Raj Kumar (Premium Tier)
ID: DLV-PAL-2024-0847

┌────────────────────────────────────┐
│ Performance Dashboard              │
├────────────────────────────────────┤
│ Overall Rating:        4.8/5.0 ★★★ │
│ Total Deliveries:      1,247       │
│ Successful:            1,221 (97%) │
│ On-Time %:             98.2%       │
│ Damaged/Lost:          0.5%        │
│ Customer Complaints:   15 (1.2%)   │
│ Response Time to Chat: <3 min avg  │
│ Cancellations:         0.8%        │
├────────────────────────────────────┤
│ Monthly Earnings:      ₹35,000-₹42,000
│ Incentive Bonus:       ₹2,500 (Oct)
│ Promotion:             Premium Tier
│ Status:                Active      │
└────────────────────────────────────┘

Recent Reviews:
⭐⭐⭐⭐⭐ "Excellent service, very professional!" - Sept 12
⭐⭐⭐⭐⭐ "Arrived on time, handled carefully" - Sept 11
⭐⭐⭐⭐☆ "Good, minor delay due to traffic" - Sept 10
⭐⭐⭐⭐⭐ "Great experience! Will request Raj again" - Sept 9
```

---

## 4. Complete User Workflows with Diagrams

### 4.1 Workflow A: Track Active Medicine Delivery

```
START
  │
  ├─> User opens Aetos app
  │
  ├─> App loads "Active Orders" section
  │   (Query: SELECT * FROM orders WHERE status IN 
  │    ('pending_pickup', 'in_transit', 'out_for_delivery'))
  │
  ├─> Display cards with real-time progress
  │   Card shows:
  │   ├─ Order ID (e.g., AMH-PH-2024-00892)
  │   ├─ Status badge (e.g., "Out for Delivery")
  │   ├─ Progress bar (e.g., 75% complete)
  │   ├─ Distance (e.g., "2.3 km away")
  │   ├─ ETA (e.g., "12:30 PM, 8 mins")
  │   └─ Item list
  │
  ├─> User clicks on order card
  │
  ├─> App opens detailed tracking view:
  │   ├─ Live GPS map
  │   │   ├─ User location (marked with 🏠)
  │   │   ├─ Delivery partner current position
  │   │   ├─ Route to delivery address
  │   │   └─ Distance indicator
  │   │
  │   ├─ Status Timeline
  │   │   ├─ ✓ Order Placed (10:45 AM)
  │   │   ├─ ✓ Picked Up (11:30 AM)
  │   │   ├─ ◐ Out for Delivery (12:15 PM)
  │   │   └─ ○ Expected Delivery (12:30 PM)
  │   │
  │   └─ Delivery Partner Panel
  │       ├─ Partner name: Raj Kumar
  │       ├─ Rating: 4.8/5 (1,247 deliveries)
  │       ├─ On-time %: 98%
  │       ├─ Phone & Chat buttons
  │       └─ Call/Message option
  │
  ├─> Backend continuously updates GPS every 30 seconds
  │   Every update:
  │   ├─ Calculate new ETA using Haversine formula
  │   ├─ Update distance display
  │   ├─ Check if distance < 1km (trigger "nearby" notification)
  │   ├─ Check if ETA < 5 mins (trigger "arriving soon")
  │   └─ Store GPS coordinate in time-series DB
  │
  ├─> User can contact partner
  │   ├─ Click "Call" → Initiate phone call
  │   ├─ Click "Chat" → Open messaging interface
  │   │   └─ Send messages in real-time
  │   └─ Backend routes through communication server
  │
  ├─> Delivery complete
  │   ├─ Partner marks as delivered
  │   ├─ GPS location locked at delivery point
  │   ├─ Timeline updates with delivery time
  │   ├─ Status changes to "Delivered"
  │   ├─ Notification sent (SMS + Push)
  │   └─ Order moved to history
  │
  └─> END

Notification Flow:
- Order Placed: In-app notification only
- Picked Up: Push + SMS
- Out for Delivery: Push + SMS + In-app
- 5 mins away: Push + SMS (alert)
- Delivered: Push + SMS + Email + In-app
```

### 4.2 Workflow B: Lab Sample Collection & Delivery

```
START
  │
  ├─> User books lab test on Aetos
  │   ├─ Select test type
  │   ├─ Choose collection time slot
  │   └─ Confirm home address
  │
  ├─> System creates order:
  │   AMH-LAB-2024-00891
  │   Type: Lab Sample Collection
  │   Status: Pending Pickup
  │   ETA Window: 30 mins from scheduled time
  │
  ├─> Notification to User
  │   ├─ "Lab collection scheduled for Sept 13, 2:00 PM"
  │   ├─ "Technician Priya Sharma will collect at home"
  │   └─ Link to tracking page
  │
  ├─> Lab Technician App
  │   ├─ Receives batch of collections (8-10 per route)
  │   ├─ Optimized route planning
  │   ├─ Starts GPS tracking
  │   └─ Begins route with first customer
  │
  ├─> User receives notification
  │   ├─ "Technician is on the way - 8.5 km away"
  │   ├─ Shows technician details & rating
  │   └─ Map with live location
  │
  ├─> Technician arrives at home
  │   ├─ Calls user (automated system)
  │   ├─ Verifies customer identity
  │   ├─ Collects sample (5-10 mins)
  │   ├─ Takes photos of collection (biohazard protocol)
  │   ├─ Scans customer & sample barcode
  │   └─ Marks "Sample Collected" in system
  │
  ├─> User sees status update in real-time
  │   ├─ Timeline shows "Sample Collected" with timestamp
  │   ├─ Photo proof available for download
  │   ├─ Next step: "In Transit to Lab"
  │   └─ Estimated lab arrival time
  │
  ├─> Technician delivers samples to lab
  │   ├─ Drives to lab (maintaining temperature)
  │   ├─ GPS tracked entire route
  │   ├─ Hands over samples to lab manager
  │   ├─ Gets handover receipt (photo)
  │   └─ Marks "Delivered to Lab" in system
  │
  ├─> User receives "sample at lab" notification
  │   ├─ "Your sample is now at Quick Labs HSR"
  │   ├─ Expected report time: 24-48 hours
  │   └─ Link to tracking page
  │
  ├─> Lab processes sample (24-48 hours)
  │   ├─ Initial processing: 2 hours
  │   ├─ Testing: 6-8 hours
  │   ├─ QA verification: 4 hours
  │   └─ Report generation: 2-4 hours
  │
  ├─> User receives notifications
  │   ├─ "Processing started" (2 hours)
  │   ├─ "Testing in progress" (6-8 hours)
  │   ├─ "QA verification" (4 hours)
  │   ├─ "Report ready" (final)
  │   └─ Link to download digital report
  │
  ├─> Report delivery
  │   ├─ Digital report available in Aetos app
  │   ├─ Email copy sent to user
  │   ├─ Doctor interpretation available
  │   └─ Share option with family members
  │
  └─> END

Status Timeline (Sample):
┌─ Sept 13, 1:30 PM: Sample Collection Scheduled
├─ Sept 13, 1:50 PM: Technician En Route (7.2 km away)
├─ Sept 13, 2:15 PM: Sample Collected
├─ Sept 13, 2:45 PM: In Transit to Lab (8.1 km)
├─ Sept 13, 3:20 PM: Delivered to Lab
├─ Sept 14, 9:30 AM: Processing Complete
├─ Sept 14, 10:00 AM: Testing Started
├─ Sept 14, 4:30 PM: QA Verification
└─ Sept 14, 6:15 PM: Report Ready
```

### 4.3 Workflow C: Exception Handling & Delivery Failure

```
DELIVERY ISSUE DETECTION
  │
  ├─> Scenario 1: Delivery Partner Stops Moving
  │   ├─ No GPS update for 5+ minutes
  │   ├─ System flags as "potential issue"
  │   ├─ Auto-sends chat: "Are you okay?"
  │   ├─ If no response after 3 mins
  │   │   ├─ Call delivery partner automatically
  │   │   ├─ If unreachable, escalate to supervisor
  │   │   ├─ Notify user: "Slight delay, we're checking"
  │   │   └─ Supervisor contacts delivery partner
  │   └─ Resolution: Partner responds & continues
  │
  ├─> Scenario 2: Delivery Partner Goes Off Route
  │   ├─ GPS deviation > 2 km from expected route
  │   ├─ Check if intentional (fuel, ATM, etc.)
  │   ├─ Send message: "Different route detected. OK?"
  │   ├─ If concerning
  │   │   ├─ Monitor distance to delivery location
  │   │   ├─ Notify user of delay
  │   │   ├─ Extend ETA appropriately
  │   │   └─ Offer alternative delivery if needed
  │   └─ Update route in real-time
  │
  ├─> Scenario 3: Order Cannot Be Delivered
  │   ├─ Delivery partner unable to find address
  │   ├─ User not picking up phone
  │   ├─ User not at home
  │   ├─ Or gate/building access issue
  │   │
  │   ├─ System workflow:
  │   │   ├─ Attempt contact via SMS + App notification
  │   │   ├─ Wait 5 minutes
  │   │   ├─ Re-attempt phone call
  │   │   ├─ After 3 failed attempts
  │   │   │   ├─ Mark as "Unable to Deliver"
  │   │   │   ├─ Update order status
  │   │   │   ├─ Store return address
  │   │   │   ├─ Return to pharmacy/lab
  │   │   │   ├─ Initiate refund process
  │   │   │   └─ Offer rescheduling
  │   │   └─ Send email to user: "Delivery Attempted"
  │   │
  │   └─> User can reschedule
  │       ├─ Select new delivery time
  │       ├─ Confirm address
  │       ├─ Get new assignment
  │       └─ Tracking resets
  │
  ├─> Scenario 4: Package Damaged/Lost
  │   ├─ On delivery, customer reports damage
  │   ├─ Photo evidence required
  │   ├─ Delivery partner files report
  │   ├─ Insurance claim initiated
  │   ├─ Pharmacy/Lab notified
  │   ├─ Replacement ordered
  │   ├─ Zero-cost to customer
  │   └─ New delivery scheduled
  │
  └─> RESOLUTION

Exception Notification Strategy:
User receives:
- Delay Alert (if >15 mins late) via SMS + Push
- Contact Partner link (call/chat)
- Escalation button ("Report Issue")
- Rescheduling option
- Compensation eligibility (delay credits)
```

---

## 5. Live GPS & Location Services

### 5.1 GPS Tracking Implementation

#### Location Update Frequency
```
Normal Conditions:
├─ Every 30 seconds (default)
├─ Accuracy requirement: ±50 meters
└─ Battery optimization: Adaptive based on speed

Close to Destination (Within 5 km):
├─ Every 15 seconds
├─ More frequent updates improve UX
└─ Approach precision: ±20 meters

Approaching User (<1 km):
├─ Every 10 seconds
├─ Maximum precision needed
└─ Critical phase for ETA accuracy
```

#### GPS Data Flow

```
Delivery Partner Phone (GPS Module)
        │
        ├─ Obtain location: {latitude, longitude, accuracy, speed}
        │   Using: GPS + WiFi + Cellular triangulation
        │
        ├─ Validate: 
        │   ├─ Accuracy < 50m
        │   ├─ Speed < 120 km/h (sanity check)
        │   ├─ Movement > 5m from previous location
        │   └─ Timestamp within 2 minutes
        │
        ├─ Package: JSON payload
        │   {
        │     "delivery_id": "DLV-PAL-2024-0847",
        │     "order_id": "AMH-PH-2024-00892",
        │     "lat": 12.9352,
        │     "lng": 77.6245,
        │     "accuracy": 45,
        │     "speed": 28.5,
        │     "timestamp": 1694598920,
        │     "battery": 78
        │   }
        │
        ├─ Send via HTTPS (encrypted)
        │   POST /api/v1/delivery/location/update
        │
        └─> Backend Server
            │
            ├─ Receive & validate
            │
            ├─ Store in Time-Series DB
            │   Collection: delivery_gps_locations
            │   Index: {order_id, timestamp}
            │
            ├─ Calculate Distance & ETA
            │   Using Haversine formula:
            │   a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
            │   c = 2 × atan2(√a, √(1−a))
            │   distance = R × c (R = 6371 km)
            │
            ├─ Query Google Maps API (if distance > 1 km)
            │   ├─ Get current ETA based on traffic
            │   ├─ Cache ETA for 30 seconds
            │   └─ Account for traffic conditions
            │
            ├─ Update Order Record
            │   UPDATE orders SET
            │   current_lat = 12.9352,
            │   current_lng = 77.6245,
            │   distance_km = 2.3,
            │   eta = '12:30 PM',
            │   last_update = NOW()
            │   WHERE order_id = 'AMH-PH-2024-00892'
            │
            ├─ Publish to WebSocket
            │   Channel: order:AMH-PH-2024-00892
            │   Message: {lat, lng, distance_km, eta}
            │
            └─> User App
                │
                ├─ Receive WebSocket update
                │
                ├─ Update map marker position
                │   (Smooth animation, 500ms transition)
                │
                ├─ Update distance display
                │   "2.3 km away, ~8 mins"
                │
                ├─ Update progress bar
                │   (75% complete based on distance)
                │
                ├─ Check notifications
                │   ├─ If distance < 2 km: "Almost here!"
                │   ├─ If distance < 1 km: "Delivery nearby"
                │   ├─ If ETA < 5 mins: "Arriving soon"
                │   └─ Store in notification center
                │
                └─ User sees live updates
```

### 5.2 Geofencing & Arrival Detection

```
Geofence Setup for Each Delivery:

User Address: 12.9352° N, 77.6245° E
Circular Geofence: 500m radius

        User Home (center)
              ●
             ╱│╲
            ╱ │ ╲
           │  │  │  500m radius
           │  │  │
            ╲ │ ╱
             ╲│╱
              ●

Geofence Events:

1. Delivery Partner ENTERS Geofence (500m)
   ├─ Trigger: Notification - "Delivery nearby!"
   ├─ Type: SMS + Push + In-app
   ├─ Message: "Raj Kumar is 500m away, ~10 mins"
   └─ Start sound notification (if enabled)

2. Delivery Partner ENTERS Geofence (100m)
   ├─ Trigger: Notification - "Almost here!"
   ├─ Type: Push + In-app (high priority)
   ├─ Message: "Raj Kumar is 100m away, 2-3 mins"
   ├─ Increase notification sound volume
   └─ Trigger: Allow auto-unlock (if available)

3. Delivery Partner EXITS Geofence (500m)
   ├─ Trigger: Alert - "Delivery going away?"
   ├─ Call delivery partner (automated)
   ├─ Message: "Are you still delivering to this address?"
   ├─ Get confirmation before continuing
   └─ Or escalate to support

4. Delivery Partner at Final Location (< 50m)
   ├─ Trigger: "Delivery partner has arrived"
   ├─ System auto-initiates phone call verification
   ├─ User can confirm via app ("Open Door" button)
   ├─ Partner can upload delivery photo
   ├─ Mark as delivered with GPS coordinates
   └─ Trigger delivery complete notification

Geofence Implementation:
- Update geofence coordinates in real-time
- Adaptive radius: 500m (default), 100m (near arrival)
- Battery optimized: Check every 15 seconds (when near)
- Fallback: Manual check if GPS unavailable
- Database: Store all geofence entries/exits
```

---

## 6. Notification System Architecture

### 6.1 Multi-Channel Notification Strategy

```
Notification Event Trigger System

Order Event                 Notification Rule                   Channels
────────────────────────────────────────────────────────────────────────

1. Order Placed        
   └─> Pharmacy assigned  ├─ In-app notification            In-app
                          ├─ Email confirmation              Email
                          └─ SMS with tracking link          SMS

2. Order Picked Up      
   └─> Driver assigned  ├─ Push notification (high)          Push
                          ├─ SMS with driver details         SMS
                          ├─ Driver photo + rating           In-app
                          └─ Tracking link active            In-app

3. In Transit
   └─> Left pharmacy    ├─ Push notification (medium)        Push
                          ├─ Map view available              In-app
                          └─ Live ETA                        In-app

4. Nearby (<500m)
   └─> Entering geo      ├─ Push notification (high)         Push
                          ├─ SMS alert                       SMS
                          ├─ Sound + vibration               App
                          └─ Call preparation                In-app

5. Very Close (<100m)
   └─> About to arrive  ├─ Push notification (urgent)       Push
                          ├─ SMS urgent                      SMS
                          ├─ Phone call option               In-app
                          ├─ Auto-unlock trigger             Device
                          └─ Photo verification              Camera

6. Delivery Attempt Failed
   └─> Unable to deliver ├─ Push (high priority)            Push
                          ├─ SMS + phone call               SMS/Call
                          ├─ Return initiated                Email
                          ├─ Reschedule link                 In-app
                          └─ Refund initiated                Email

7. Delivered
   └─> Order complete   ├─ Push notification                Push
                          ├─ SMS confirmation               SMS
                          ├─ Email receipt                   Email
                          ├─ Delivery photo                  In-app
                          ├─ Rating request                  In-app
                          └─ Feedback form                   In-app

8. Delay Alert
   └─> >15 mins late    ├─ SMS alert                        SMS
                          ├─ Push notification               Push
                          ├─ New ETA                         In-app
                          ├─ Call delivery partner           In-app
                          └─ Delay credits offered           In-app
```

### 6.2 Notification Center UI

```
Notification Center Example (In-App):

┌─────────────────────────────────────────┐
│ Notifications (5 unread)                │
├─────────────────────────────────────────┤
│                                         │
│ 🚚 Out for Delivery         [2 min ago] │
│ Your medicine order #AMH-PH-2024-00892 │
│ is now out for delivery                 │
│ [View Details] [Mark as Read]           │
│                                         │
│ ⏰ Delay Alert              [45 min ago]│
│ Expected delay due to traffic           │
│ New ETA: 1:00 PM (+15 mins)            │
│ [Contact Partner] [OK]                  │
│                                         │
│ 📦 Picked Up               [1 hour ago] │
│ Raj Kumar collected your order from     │
│ Apollo Pharmacy Indiranagar             │
│ [Archive]                               │
│                                         │
│ ✓ Delivered               [Yesterday]  │
│ Your lab sample was successfully        │
│ collected and delivered to Quick Labs   │
│ [View Receipt] [Rate Experience]        │
│                                         │
│ 🔔 Refill Reminder        [2 days ago] │
│ Your Metformin expires in 5 days        │
│ [Refill Now] [Later]                    │
│                                         │
└─────────────────────────────────────────┘

Notification Preferences (Settings):
□ ✓ Order Updates (SMS + Push + Email)
□ ✓ Delivery Alerts (Push + SMS)
□ ✓ Distance Alerts (Push only, <2 km)
□ ✓ Arrival Alert (Push + SMS + call)
□   □ Marketing (Disabled)
└─ Quiet hours: 9 PM - 8 AM (no sound)
```

---

## 7. Database Schema & API Design

### 7.1 Database Schema

#### Table 1: Orders
```sql
CREATE TABLE orders (
    order_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    order_type ENUM('medicine', 'lab') NOT NULL,
    status ENUM('pending_pickup', 'in_transit', 'out_for_delivery', 
                'delivered', 'failed', 'returned') DEFAULT 'pending_pickup',
    pharmacy_id VARCHAR(50),
    lab_id VARCHAR(50),
    delivery_partner_id VARCHAR(50),
    
    source_lat DECIMAL(10, 8),
    source_lng DECIMAL(10, 8),
    destination_lat DECIMAL(10, 8),
    destination_lng DECIMAL(10, 8),
    
    current_lat DECIMAL(10, 8),
    current_lng DECIMAL(10, 8),
    distance_km DECIMAL(6, 2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pickup_time TIMESTAMP,
    delivery_time TIMESTAMP,
    expected_eta TIMESTAMP,
    
    items JSON,
    total_amount DECIMAL(10, 2),
    notes TEXT,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    INDEX idx_user_status (user_id, status),
    INDEX idx_partner_status (delivery_partner_id, status),
    INDEX idx_created_date (created_at)
);
```

#### Table 2: Delivery Partners
```sql
CREATE TABLE delivery_partners (
    partner_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    tier ENUM('premium', 'standard', 'emerging') DEFAULT 'standard',
    
    overall_rating DECIMAL(3, 2),
    total_deliveries INT DEFAULT 0,
    successful_deliveries INT DEFAULT 0,
    on_time_percentage DECIMAL(5, 2),
    damage_loss_percentage DECIMAL(5, 2),
    cancellation_rate DECIMAL(5, 2),
    
    vehicle_type VARCHAR(50),
    vehicle_number VARCHAR(20),
    insurance_active BOOLEAN,
    
    current_lat DECIMAL(10, 8),
    current_lng DECIMAL(10, 8),
    current_status ENUM('offline', 'online', 'on_delivery', 'break') DEFAULT 'offline',
    
    is_active BOOLEAN DEFAULT TRUE,
    joined_date TIMESTAMP,
    
    INDEX idx_tier (tier),
    INDEX idx_rating (overall_rating DESC)
);
```

#### Table 3: GPS Locations (Time-Series)
```sql
CREATE TABLE delivery_gps_locations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL,
    partner_id VARCHAR(50) NOT NULL,
    
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(10, 8) NOT NULL,
    accuracy DECIMAL(6, 2),
    speed DECIMAL(6, 2),
    
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_order_timestamp (order_id, timestamp DESC),
    INDEX idx_partner_timestamp (partner_id, timestamp DESC),
    INDEX idx_created_date (created_at)
);
-- Retention: 90 days, then archive to S3
```

#### Table 4: Notifications
```sql
CREATE TABLE notifications (
    notification_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    order_id VARCHAR(50),
    
    type ENUM('order_placed', 'picked_up', 'in_transit', 
              'nearby', 'out_for_delivery', 'delivered', 
              'delay_alert', 'failure', 'reminder') NOT NULL,
    title VARCHAR(200),
    message TEXT,
    
    channels JSON,  -- ['sms', 'push', 'email', 'in_app']
    status ENUM('pending', 'sent', 'failed', 'read') DEFAULT 'pending',
    
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP,
    
    INDEX idx_user_created (user_id, created_at DESC),
    INDEX idx_order (order_id)
);
```

### 7.2 REST API Endpoints

#### 1. Get Active Orders
```
GET /api/v1/tracking/orders?status=active

Response:
{
  "success": true,
  "data": {
    "active_orders": [
      {
        "order_id": "AMH-PH-2024-00892",
        "type": "medicine",
        "status": "out_for_delivery",
        "partner": {
          "id": "DLV-PAL-2024-0847",
          "name": "Raj Kumar",
          "rating": 4.8,
          "on_time_percentage": 98.2,
          "phone": "919876543210",
          "vehicle": "Hero Splendor (KA-01-AB-1234)"
        },
        "current_location": {
          "lat": 12.9352,
          "lng": 77.6245,
          "distance_km": 2.3,
          "eta": "2024-09-13T12:30:00Z",
          "eta_minutes": 8
        },
        "progress": {
          "status_timeline": [
            {
              "status": "placed",
              "timestamp": "2024-09-13T10:45:00Z",
              "completed": true
            },
            {
              "status": "picked_up",
              "timestamp": "2024-09-13T11:30:00Z",
              "completed": true
            },
            {
              "status": "out_for_delivery",
              "timestamp": "2024-09-13T12:15:00Z",
              "completed": true
            },
            {
              "status": "delivery_expected",
              "timestamp": "2024-09-13T12:30:00Z",
              "completed": false
            }
          ],
          "progress_percentage": 75
        },
        "items": ["Metformin 500mg (30 tabs)", "Aspirin 75mg (28 tabs)"],
        "amount": 1245.50
      }
    ],
    "total_orders": 1
  }
}
```

#### 2. Get Order Details with Live Map
```
GET /api/v1/tracking/order/{order_id}

Response:
{
  "success": true,
  "data": {
    "order_id": "AMH-PH-2024-00892",
    "type": "medicine",
    "source": {
      "name": "Apollo Pharmacy Indiranagar",
      "lat": 12.9345,
      "lng": 77.6210,
      "phone": "918040223000"
    },
    "destination": {
      "address": "Flat 302, Prestige Pallasio, HSR Layout",
      "lat": 12.9300,
      "lng": 77.6200,
      "landmark": "Near Cafe Coffee Day"
    },
    "delivery_partner": {
      "id": "DLV-PAL-2024-0847",
      "name": "Raj Kumar",
      "phone": "919876543210",
      "rating": 4.8,
      "total_deliveries": 1247,
      "on_time_percentage": 98.2,
      "photo_url": "https://aetos.com/drivers/raj-kumar.jpg",
      "vehicle": "Hero Splendor (KA-01-AB-1234)",
      "vehicle_photo": "https://aetos.com/vehicles/ka-01-ab-1234.jpg"
    },
    "current": {
      "lat": 12.9352,
      "lng": 77.6245,
      "accuracy": 45,
      "speed": 28.5,
      "last_update": "2024-09-13T12:22:45Z"
    },
    "route": {
      "distance_traveled": 4.2,
      "distance_remaining": 2.3,
      "eta": "2024-09-13T12:30:00Z",
      "eta_minutes": 8,
      "route_coordinates": [
        [12.9345, 77.6210],
        [12.9350, 77.6220],
        [12.9352, 77.6245],
        [12.9300, 77.6200]
      ]
    },
    "notifications": {
      "unread_count": 2,
      "latest": [
        {
          "type": "out_for_delivery",
          "timestamp": "2024-09-13T12:15:00Z",
          "message": "Your order is out for delivery"
        }
      ]
    }
  }
}
```

#### 3. Update GPS Location (Partner App)
```
POST /api/v1/delivery/location/update

Request:
{
  "partner_id": "DLV-PAL-2024-0847",
  "order_id": "AMH-PH-2024-00892",
  "latitude": 12.9352,
  "longitude": 77.6245,
  "accuracy": 45,
  "speed": 28.5,
  "timestamp": 1694598920,
  "battery": 78
}

Response:
{
  "success": true,
  "data": {
    "distance_km": 2.3,
    "eta_minutes": 8,
    "next_update_in": 30
  }
}
```

#### 4. Contact Delivery Partner
```
POST /api/v1/tracking/order/{order_id}/contact

Request:
{
  "contact_type": "call" | "chat",
  "message": "Optional message for chat",
  "user_id": "USER-2024-001"
}

Response:
{
  "success": true,
  "data": {
    "contact_initiated": true,
    "partner_phone": "919876543210",
    "chat_session_id": "CHAT-2024-00892",
    "message": "Connecting to Raj Kumar..."
  }
}
```

#### 5. Mark as Delivered (Partner App)
```
POST /api/v1/delivery/complete

Request:
{
  "order_id": "AMH-PH-2024-00892",
  "partner_id": "DLV-PAL-2024-0847",
  "delivery_lat": 12.9300,
  "delivery_lng": 77.6200,
  "delivery_photo_url": "https://aetos.com/deliveries/img-2024-00892.jpg",
  "signature_base64": "data:image/png;base64,...",
  "delivery_notes": "Delivered to Flat 302, customer present",
  "timestamp": 1694598915
}

Response:
{
  "success": true,
  "data": {
    "order_id": "AMH-PH-2024-00892",
    "status": "delivered",
    "delivery_time": "2024-09-13T12:30:15Z",
    "notification_sent": true,
    "next_task": "rate_experience"
  }
}
```

---

## 8. Performance & SLA Metrics

### 8.1 Delivery Time SLAs by Tier

| Metric | Premium | Standard | Emerging |
|--------|---------|----------|----------|
| **Pickup Time** | <30 mins | <45 mins | <60 mins |
| **Average Delivery** | 45 mins | 60 mins | 75 mins |
| **On-Time %** | 98%+ | 95%+ | 90%+ |
| **Damage Rate** | <0.5% | <2% | <3% |
| **GPS Accuracy** | ±20m | ±50m | ±50m |
| **ETA Accuracy** | ±3 mins | ±5 mins | ±7 mins |
| **Cancellation Rate** | <0.8% | <2% | <3% |

### 8.2 System Performance Targets

```
API Response Times:
├─ Get active orders: <200 ms (p95)
├─ Get order details: <150 ms (p95)
├─ Update GPS location: <500 ms (p95)
├─ Create order: <1000 ms (p95)
└─ Contact partner: <100 ms (p95)

Tracking Accuracy:
├─ GPS position: ±20-50 meters
├─ ETA calculation: ±3-7 minutes
├─ Distance calculation: ±5% error max
└─ Speed calculation: ±10% error max

Notification Latency:
├─ Status change notification: <10 seconds
├─ Delay alert notification: <15 seconds
├─ Nearby alert notification: <5 seconds
└─ Delivery notification: <2 seconds

Database Performance:
├─ Order query: <100 ms (avg)
├─ GPS data insertion: <50 ms (avg)
├─ Partner query: <50 ms (avg)
└─ Notification insertion: <30 ms (avg)

Server Availability:
├─ Uptime: 99.95% monthly SLA
├─ RTO (Recovery Time Objective): <15 mins
├─ RPO (Recovery Point Objective): <5 mins
└─ Backup frequency: Every 6 hours
```

---

## 9. Compliance & Data Security

### 9.1 DPDPA 2023 Compliance

#### Data Retention Policy
```
GPS Coordinates:
├─ Live tracking: 30 seconds (real-time only)
├─ Active orders: Retained during delivery
├─ Completed orders: 7 days in hot storage
├─ Archive: 90 days in cold storage (S3)
└─ Purge: After 1 year

User Notifications:
├─ Active: Retained in app
├─ Archive: 90 days in history
└─ Purge: After 6 months

Delivery Partner Information:
├─ Active partners: Indefinitely (necessary for operations)
├─ Ratings/reviews: 2 years for dispute resolution
├─ GPS data: 1 year for performance analysis
└─ Communication logs: 6 months (compliance)
```

#### Data Encryption
```
In Transit:
├─ TLS 1.3 for all API communications
├─ 256-bit HTTPS encryption
├─ Certificate pinning for mobile apps
└─ End-to-end encryption for chats

At Rest:
├─ AES-256 encryption for all PII
├─ Encrypted database backups
├─ Encrypted message queues
├─ KMS key rotation: Every 90 days
└─ Separate encryption keys per tenant

PII Fields Encrypted:
├─ User phone number
├─ Delivery addresses
├─ Delivery partner phone
├─ Chat messages
├─ Payment information
└─ GPS coordinates (location data)
```

#### User Rights
```
Users have right to:
├─ Access their data (export)
├─ Correct inaccurate data
├─ Delete/forget data (after delivery complete)
├─ Opt-out of tracking (after delivery ends)
├─ Data portability
├─ Lodge complaints with regulatory authority
└─ Withdraw consent anytime

Data Subject Requests:
├─ Processing time: 30 days max
├─ Response format: JSON export
├─ Includes: All tracking data, notifications, feedback
└─ Deletion: Scheduled purge after 30 days
```

### 9.2 Security Measures

```
API Security:
├─ OAuth 2.0 authentication
├─ JWT tokens with 1-hour expiry
├─ Rate limiting: 100 req/min per user
├─ Input validation & sanitization
├─ SQL injection prevention
├─ XSS protection
└─ CSRF tokens on all state changes

Application Security:
├─ Regular penetration testing
├─ OWASP Top 10 compliance
├─ Dependency vulnerability scanning
├─ Secure code review process
├─ Bug bounty program
└─ Security headers (CSP, X-Frame-Options, etc.)

Access Control:
├─ Role-based access (RBAC)
├─ Multi-factor authentication for staff
├─ API key rotation: Every 90 days
├─ Principle of least privilege
├─ Audit logging for all admin actions
└─ Session timeouts: 24 hours

Infrastructure Security:
├─ AWS VPC isolation
├─ WAF (Web Application Firewall)
├─ DDoS protection
├─ VPN for admin access
├─ Bastion host for database access
└─ Regular security patching
```

---

## 10. Rollout Plan & Timeline

### 10.1 4-Week Implementation Plan

#### Week 1: Foundation & Integration
```
Days 1-2: Setup
├─ Database schema creation
├─ API endpoint setup (3 endpoints)
├─ Redis cache configuration
└─ WebSocket server setup

Days 3-4: Core Features
├─ GPS location update API
├─ Order tracking query endpoints
├─ Partner assignment logic
└─ ETA calculation engine

Days 5-7: Frontend
├─ Tracking dashboard UI
├─ Live map integration (Google Maps)
├─ Real-time updates (WebSocket)
├─ Mobile responsive design
└─ Testing & bug fixes
```

#### Week 2: Notifications & Partner App
```
Days 8-9: Notification System
├─ SMS integration (Twilio)
├─ Push notification setup (Firebase)
├─ Email notifications (SendGrid)
├─ In-app notification center
└─ Notification preferences

Days 10-11: Partner Mobile App
├─ GPS location tracking
├─ Order queue display
├─ Status update buttons
├─ Photo upload for delivery
└─ Rating & feedback system

Days 12-14: Integration Testing
├─ End-to-end order flow
├─ Notification delivery testing
├─ GPS accuracy validation
├─ Partner app testing
└─ Performance testing
```

#### Week 3: Advanced Features
```
Days 15-16: Geofencing & Alerts
├─ Geofence implementation
├─ Arrival detection logic
├─ Alert notification triggers
└─ Auto-unlock integration

Days 17-18: Exception Handling
├─ Delay detection & alerts
├─ Unable-to-deliver workflow
├─ Rescheduling system
├─ Escalation procedures
└─ Refund automation

Days 19-21: Analytics & Reporting
├─ Tracking dashboard (admin)
├─ Performance metrics
├─ Partner analytics
├─ Delivery time analysis
└─ Customer satisfaction metrics
```

#### Week 4: Launch & Optimization
```
Days 22-23: UAT & Bug Fixes
├─ User acceptance testing
├─ Partner feedback incorporation
├─ Performance optimization
├─ Security audit
└─ Load testing (1000 concurrent users)

Days 24-25: Production Preparation
├─ Database backup procedures
├─ Disaster recovery testing
├─ Monitoring setup (DataDog/New Relic)
├─ Alert configuration
└─ Runbook documentation

Days 26-28: Gradual Rollout
├─ Day 26: Soft launch (10% users)
├─ Day 27: Expand to 50% users
├─ Day 28: Full launch (100% users)
├─ Real-time monitoring
└─ Issue response team
```

---

## 11. Expected Outcomes & Business Metrics

### 11.1 Key Performance Indicators (KPIs)

#### Customer Metrics
```
Metric                          Target      Current     Improvement
────────────────────────────────────────────────────────────────────
Order Tracking Adoption         95%         0%          New feature
Average Delivery Rating         4.8/5       -           Track quality
Customer Satisfaction           92%         -           Transparency
Delivery Feedback Rate          80%         -           Engagement
Support Ticket Reduction        -30%        -           Self-service
Repeat Order Rate              +15%         -           Convenience
```

#### Operational Metrics
```
Metric                          Target      Impact
─────────────────────────────────────────────────────
On-Time Delivery %              95%+        Partner accountability
Avg Delivery Time               60 min      Efficiency
Delivery Success Rate           98%+        Reliability
Customer Wait Time During       <5 min      Responsiveness
Delivery Attempt
GPS Accuracy                    ±50m        Precision
ETA Accuracy                    ±5 min      Reliability
```

#### Business Metrics
```
Metric                          Target      Impact
─────────────────────────────────────────────────────
Orders Tracked/Month            50,000+     Scale
Average Order Value             ₹1,200      Revenue
Delivery Cost/Order             -₹15        Efficiency
Partner Commission              ₹50-80      Retention
System Uptime                   99.95%      Reliability
Support Escalations             -40%        Quality
```

### 11.2 Success Criteria

**Launch Success (Week 1):**
- ✓ 100% of orders show tracking data
- ✓ GPS updates within 30 seconds
- ✓ Notification delivery >95% success rate
- ✓ Zero critical bugs reported
- ✓ System handles 1000 concurrent users

**Month 1 Goals:**
- ✓ 75%+ user adoption of tracking feature
- ✓ Average ETA accuracy within ±5 minutes
- ✓ 95%+ delivery partner app usage
- ✓ Delivery success rate improves 3%
- ✓ Support tickets reduced by 20%

**Month 3 Goals:**
- ✓ 90%+ user adoption
- ✓ 4.8/5 average customer rating
- ✓ 98%+ on-time delivery rate
- ✓ 50,000+ monthly tracked orders
- ✓ Partner retention improves 15%

---

## 12. Conclusion

The Real-Time Delivery Tracking system transforms the Aetos One Medical Hub experience by providing complete transparency, reducing anxiety, and enabling seamless communication. With live GPS tracking, accurate ETAs, and multi-channel notifications, users gain confidence in their deliveries while partners receive performance metrics for improvement.

### Key Achievements:
1. ✓ Complete visibility into delivery journey
2. ✓ Accurate, real-time location tracking
3. ✓ Proactive notifications for critical events
4. ✓ Direct communication with delivery partners
5. ✓ Data-driven performance improvement
6. ✓ DPDPA 2023 compliance
7. ✓ Scalable architecture for growth

### Next Phase Considerations:
- AI-powered ETA prediction (machine learning)
- Delivery route optimization (traveling salesman problem)
- Autonomous drone delivery integration
- Multi-stop batch delivery optimization
- Insurance claim automation for damage/loss
- Real-time delivery feedback analytics

---

**Document Control:**
- Version: 1.0
- Status: Final - Ready for Implementation
- Author: Aetos Medical Hub Dev Team
- Last Updated: September 13, 2024
- Approval: Engineering Lead + Product Manager
