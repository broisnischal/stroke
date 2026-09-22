-- ClickHouse has no foreign keys or sequences, so the same shape arrives
-- flattened: MergeTree tables with an explicit order key.
CREATE DATABASE IF NOT EXISTS shop;

CREATE TABLE IF NOT EXISTS shop.customers (
  id        UInt32,
  email     String,
  full_name String,
  signed_up DateTime DEFAULT now(),
  is_active UInt8 DEFAULT 1
) ENGINE = MergeTree ORDER BY id;

CREATE TABLE IF NOT EXISTS shop.products (
  id         UInt32,
  sku        String,
  name       String,
  price      Decimal(10,2),
  tags       Array(String),
  metadata   String,
  created_at DateTime DEFAULT now()
) ENGINE = MergeTree ORDER BY id;

CREATE TABLE IF NOT EXISTS shop.orders (
  id          UInt32,
  customer_id UInt32,
  placed_at   DateTime DEFAULT now(),
  status      LowCardinality(String),
  total       Decimal(10,2)
) ENGINE = MergeTree ORDER BY (customer_id, id);

CREATE TABLE IF NOT EXISTS shop.order_items (
  order_id   UInt32,
  product_id UInt32,
  quantity   UInt32,
  unit_price Decimal(10,2)
) ENGINE = MergeTree ORDER BY (order_id, product_id);

INSERT INTO shop.customers (id, email, full_name, is_active) VALUES
  (1,'ada@example.com','Ada Lovelace',1),
  (2,'alan@example.com','Alan Turing',1),
  (3,'grace@example.com','Grace Hopper',1),
  (4,'edsger@example.com','Edsger Dijkstra',0),
  (5,'barbara@example.com','Barbara Liskov',1);

INSERT INTO shop.products (id, sku, name, price, tags, metadata) VALUES
  (1,'KB-001','Mechanical keyboard',129.00,['input','desk'],'{"switches":"brown"}'),
  (2,'MS-002','Trackball mouse',79.50,['input'],'{"buttons":6}'),
  (3,'MN-003','27" display',449.99,['display','desk'],'{"hz":144}'),
  (4,'CB-004','USB-C cable',19.00,['cable'],'{"length_m":2}'),
  (5,'DK-005','Docking station',219.00,['desk','cable'],'{"ports":11}');

INSERT INTO shop.orders (id, customer_id, status, total) VALUES
  (1,1,'shipped',208.50),(2,2,'pending',449.99),(3,3,'shipped',19.00),
  (4,1,'cancelled',219.00),(5,5,'pending',148.00);

INSERT INTO shop.order_items (order_id, product_id, quantity, unit_price) VALUES
  (1,1,1,129.00),(1,2,1,79.50),(2,3,1,449.99),(3,4,1,19.00),
  (4,5,1,219.00),(5,1,1,129.00),(5,4,1,19.00);
