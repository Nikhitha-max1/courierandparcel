COURIER AND PARCEL TRACKING MANAGEMENT SYSTEM
================================================

TECHNOLOGIES
- HTML, CSS, JavaScript
- Node.js and Express.js
- MySQL

PROJECT STRUCTURE
- app.js       : Express server and API routes
- db.js        : MySQL connection settings
- public/      : All HTML pages
- style.css    : ONE CSS file for all pages
- script.js    : ONE JavaScript file for all pages

IMPORTANT DATABASE COLUMN ASSUMPTIONS
This project expects the following column names:
1. customers: customer_id, name, email, phone, address
2. parcels: parcel_id, customer_id, sender_address, receiver_name,
   receiver_phone, receiver_address, weight, booking_date, status
3. tracking: tracking_id, parcel_id, current_location, tracking_status,
   updated_at, remarks
4. payments: payment_id, parcel_id, amount, payment_method, payment_status

Your description contained "parce_id" and "payment_methodd". The code uses
the likely corrected names "parcel_id" and "payment_method".
If your actual MySQL columns use the misspelled names, rename those columns
in MySQL or update the corresponding SQL in app.js.

SETUP
1. Extract this ZIP file.
2. Open the extracted Courier_Parcel_Tracking folder in VS Code.
3. Open db.js and enter your MySQL password if one is configured.
4. Open the VS Code terminal in this project folder.
5. Run:
      npm install
6. Start the server:
      node app.js
7. Open:
      http://localhost:3000

DATABASE
The app connects to your existing database named courier_db.
It does not create or drop your database or tables.

IF YOU GET A DATABASE ERROR
Run these commands in MySQL Workbench and compare the output with the
column names listed above:

USE courier_db;
DESCRIBE customers;
DESCRIBE parcels;
DESCRIBE tracking;
DESCRIBE payments;

Make sure the tables have the expected columns and foreign keys.
