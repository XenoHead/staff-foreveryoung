-- schema.sql
-- Database migrations for the 3-Table Inventory System

-- 1. Inventory Table
-- Master record for all products currently carried or tracked
CREATE TABLE IF NOT EXISTS Inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  UPC TEXT UNIQUE NOT NULL,
  Quantity INTEGER DEFAULT 0,
  Format TEXT,
  Artist TEXT,
  Title TEXT,
  Vendor_Number TEXT,
  OOP TEXT,
  Year TEXT,
  Vendor TEXT,
  Modified TEXT,
  SRP TEXT,
  Image_URL TEXT,
  Genre TEXT,
  Country TEXT
);

-- 2. Sales Table
-- Permanent ledger of all sold items (parsed from IMS.xls)
CREATE TABLE IF NOT EXISTS Sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER,
  UPC TEXT NOT NULL,
  Quantity_Sold INTEGER NOT NULL,
  Date_Sold TEXT,
  SRP TEXT,
  FOREIGN KEY (inventory_id) REFERENCES Inventory(id)
);

-- 3. Orders Table
-- Ledger of pending incoming items (parsed from order_sheet.xls)
CREATE TABLE IF NOT EXISTS Orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id INTEGER,
  UPC TEXT NOT NULL,
  Quantity_Ordered INTEGER NOT NULL,
  Vendor TEXT,
  Order_Date TEXT,
  FOREIGN KEY (inventory_id) REFERENCES Inventory(id)
);
