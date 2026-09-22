-- The `shop` schema, in MySQL's dialect. A database IS a schema here, so the
-- objects live in the `shop` database the container creates.
CREATE DATABASE IF NOT EXISTS shop;
USE shop;

CREATE TABLE customers (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  email     VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  signed_up TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ;

CREATE TABLE products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  sku        VARCHAR(32) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  tags       JSON,
  metadata   JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ;

CREATE TABLE orders (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  placed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status      VARCHAR(32) NOT NULL DEFAULT 'pending',
  total       DECIMAL(10,2) NOT NULL,
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ;

CREATE TABLE order_items (
  order_id   INT NOT NULL,
  product_id INT NOT NULL,
  quantity   INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT items_order_fk   FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT items_product_fk FOREIGN KEY (product_id) REFERENCES products(id)
) ;

CREATE INDEX orders_customer_idx ON orders (customer_id, placed_at);
CREATE VIEW order_totals AS
  SELECT o.id, c.email, o.status, o.total
  FROM orders o JOIN customers c ON c.id = o.customer_id;

-- A routine, so the Functions tab has something in it.
CREATE FUNCTION order_count(cid INT) RETURNS INT DETERMINISTIC READS SQL DATA
  RETURN (SELECT COUNT(*) FROM orders WHERE customer_id = cid);

INSERT INTO customers (email, full_name, is_active) VALUES
  ('ada@example.com','Ada Lovelace',1),
  ('alan@example.com','Alan Turing',1),
  ('grace@example.com','Grace Hopper',1),
  ('edsger@example.com','Edsger Dijkstra',0),
  ('barbara@example.com','Barbara Liskov',1);

INSERT INTO products (sku, name, price, tags, metadata) VALUES
  ('KB-001','Mechanical keyboard',129.00,'["input","desk"]','{"switches":"brown","layout":"ansi"}'),
  ('MS-002','Trackball mouse',79.50,'["input"]','{"buttons":6}'),
  ('MN-003','27" display',449.99,'["display","desk"]','{"panel":"ips","hz":144}'),
  ('CB-004','USB-C cable',19.00,'["cable"]','{"length_m":2}'),
  ('DK-005','Docking station',219.00,'["desk","cable"]','{"ports":11}');

INSERT INTO orders (customer_id, status, total) VALUES
  (1,'shipped',208.50),(2,'pending',449.99),(3,'shipped',19.00),
  (1,'cancelled',219.00),(5,'pending',148.00);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1,1,1,129.00),(1,2,1,79.50),(2,3,1,449.99),(3,4,1,19.00),
  (4,5,1,219.00),(5,1,1,129.00),(5,4,1,19.00);

ANALYZE TABLE customers, products, orders, order_items;
