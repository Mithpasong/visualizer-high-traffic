CREATE TABLE products (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL,
  price       int  NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO products (name, category, price, description)
SELECT 'Product ' || g,
       'cat-' || (g % 50),
       (random() * 100000)::int,
       md5(g::text) || ' ' || md5((g * 7)::text)
FROM generate_series(1, 200000) AS g;

-- 카테고리 조회는 인덱스를 탄다. description 검색은 일부러 인덱스가 없다(풀스캔).
CREATE INDEX idx_products_category_price ON products (category, price DESC);
ANALYZE products;

-- 커스텀 SQL 전용 읽기 전용 계정
CREATE ROLE readonly LOGIN PASSWORD 'readonly';
GRANT CONNECT ON DATABASE lab TO readonly;
GRANT USAGE ON SCHEMA public TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER ROLE readonly SET default_transaction_read_only = on;
ALTER ROLE readonly SET statement_timeout = '2s';
