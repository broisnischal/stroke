-- One small, deliberately awkward schema, repeated across every dialect so the
-- same sidebar, grid and DDL views can be compared side by side.
CREATE SCHEMA IF NOT EXISTS shop;

CREATE TABLE shop.customers (
  id          serial PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  signed_up   timestamptz NOT NULL DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE shop.products (
  id          serial PRIMARY KEY,
  sku         text NOT NULL UNIQUE,
  name        text NOT NULL,
  price       numeric(10,2) NOT NULL,
  tags        text[],
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shop.orders (
  id           serial PRIMARY KEY,
  customer_id  integer NOT NULL REFERENCES shop.customers(id) ON DELETE CASCADE,
  placed_at    timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending',
  total        numeric(10,2) NOT NULL
);

CREATE TABLE shop.order_items (
  order_id    integer NOT NULL REFERENCES shop.orders(id) ON DELETE CASCADE,
  product_id  integer NOT NULL REFERENCES shop.products(id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX orders_customer_idx ON shop.orders (customer_id, placed_at DESC);
CREATE VIEW shop.order_totals AS
  SELECT o.id, c.email, o.status, o.total
  FROM shop.orders o JOIN shop.customers c ON c.id = o.customer_id;

INSERT INTO shop.customers (email, full_name, is_active) VALUES
  ('ada@example.com',    'Ada Lovelace',    true),
  ('alan@example.com',   'Alan Turing',     true),
  ('grace@example.com',  'Grace Hopper',    true),
  ('edsger@example.com', 'Edsger Dijkstra', false),
  ('barbara@example.com','Barbara Liskov',  true);

INSERT INTO shop.products (sku, name, price, tags, metadata) VALUES
  ('KB-001', 'Mechanical keyboard', 129.00, ARRAY['input','desk'],  '{"switches":"brown","layout":"ansi"}'),
  ('MS-002', 'Trackball mouse',      79.50, ARRAY['input'],         '{"buttons":6}'),
  ('MN-003', '27" display',         449.99, ARRAY['display','desk'],'{"panel":"ips","hz":144}'),
  ('CB-004', 'USB-C cable',           19.00, ARRAY['cable'],         '{"length_m":2}'),
  ('DK-005', 'Docking station',      219.00, ARRAY['desk','cable'],  '{"ports":11}');

INSERT INTO shop.orders (customer_id, status, total) VALUES
  (1, 'shipped',   208.50),
  (2, 'pending',   449.99),
  (3, 'shipped',    19.00),
  (1, 'cancelled', 219.00),
  (5, 'pending',   148.00);

INSERT INTO shop.order_items (order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 129.00), (1, 2, 1, 79.50),
  (2, 3, 1, 449.99),
  (3, 4, 1, 19.00),
  (4, 5, 1, 219.00),
  (5, 1, 1, 129.00), (5, 4, 1, 19.00);

ANALYZE;
