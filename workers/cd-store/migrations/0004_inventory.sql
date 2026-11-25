-- Available stock excludes pending reservations and sold items.
CREATE TABLE IF NOT EXISTS inventory (
 sku TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('made_to_order','in_stock','out_of_stock')),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), min_days INTEGER NOT NULL CHECK(min_days>=0 AND min_days<=60),
 max_days INTEGER NOT NULL CHECK(max_days>=min_days AND max_days<=60), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS inventory_reservations (
 order_id TEXT NOT NULL, sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 PRIMARY KEY(order_id,sku)
);
CREATE INDEX IF NOT EXISTS inventory_reservations_sku ON inventory_reservations(sku);
CREATE TABLE IF NOT EXISTS order_fulfillment (
 order_id TEXT PRIMARY KEY, stage TEXT NOT NULL CHECK(stage IN ('in_production','packaged','shipped','delivered')),
 tracking TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS inventory_reserve_order AFTER INSERT ON orders
WHEN NEW.status='pending'
BEGIN
 SELECT CASE WHEN EXISTS (
 SELECT 1 FROM json_each(NEW.payload,'$.lines') AS l
 LEFT JOIN inventory i ON i.sku=json_extract(l.value,'$.sku')
 WHERE json_extract(l.value,'$.fulfillment.mode') IS NOT NULL AND (
 COALESCE(i.mode,'made_to_order')<>json_extract(l.value,'$.fulfillment.mode')
 OR COALESCE(i.min_days,2)<>json_extract(l.value,'$.fulfillment.minDays')
 OR COALESCE(i.max_days,3)<>json_extract(l.value,'$.fulfillment.maxDays')
 OR i.mode='out_of_stock' OR (i.mode='in_stock' AND i.stock<json_extract(l.value,'$.quantity')))
 ) THEN RAISE(ABORT,'Inventory changed; refresh the cart.') END;
 INSERT INTO inventory_reservations(order_id,sku,quantity)
 SELECT NEW.id,i.sku,json_extract(l.value,'$.quantity')
 FROM json_each(NEW.payload,'$.lines') AS l JOIN inventory i ON i.sku=json_extract(l.value,'$.sku')
 WHERE i.mode='in_stock' AND json_extract(l.value,'$.fulfillment.mode')='in_stock';
 UPDATE inventory SET stock=stock-(SELECT quantity FROM inventory_reservations r WHERE r.order_id=NEW.id AND r.sku=inventory.sku),revision=revision+1
 WHERE sku IN (SELECT sku FROM inventory_reservations WHERE order_id=NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS inventory_release_order AFTER UPDATE OF status ON orders
WHEN OLD.status='pending' AND NEW.status='canceled'
BEGIN
 UPDATE inventory SET stock=stock+(SELECT quantity FROM inventory_reservations r WHERE r.order_id=NEW.id AND r.sku=inventory.sku),revision=revision+1
 WHERE sku IN (SELECT sku FROM inventory_reservations WHERE order_id=NEW.id);
 DELETE FROM inventory_reservations WHERE order_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS inventory_commit_order AFTER UPDATE OF status ON orders
WHEN OLD.status='pending' AND NEW.status IN ('paid','partially_refunded','refunded')
BEGIN
 DELETE FROM inventory_reservations WHERE order_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS inventory_prevent_pending_mode_change BEFORE UPDATE OF mode ON inventory
WHEN OLD.mode<>NEW.mode AND EXISTS (SELECT 1 FROM inventory_reservations WHERE sku=OLD.sku)
BEGIN
 SELECT RAISE(ABORT,'Cancel or complete reserved orders before changing stock mode.');
END;
