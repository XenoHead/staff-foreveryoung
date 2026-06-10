UPDATE Inventory SET Vendor = 'WebAMI' WHERE TRIM(Vendor_Number) IN ('21', '38', '30');
UPDATE Inventory SET Vendor = 'Lasgo' WHERE TRIM(Vendor_Number) = '15';
UPDATE Inventory SET Vendor = 'UNIVERSAL MUSIC DISTRIBUTION' WHERE TRIM(Vendor_Number) LIKE '50%';
UPDATE Inventory SET Vendor = 'Sony' WHERE TRIM(Vendor_Number) LIKE '3%' AND TRIM(Vendor_Number) NOT IN ('30', '38');
UPDATE Inventory SET Vendor = 'Orchard' WHERE TRIM(Vendor_Number) IN ('4', '40', '41', '42');
UPDATE Inventory SET Vendor = 'RedEye' WHERE TRIM(Vendor_Number) IN ('27', '71', '72');
UPDATE Inventory SET Vendor = 'Warner' WHERE TRIM(Vendor_Number) IN ('60', '62', '64', '65');
