export default String.raw`
-- LyLy Commerce schema. Everything lives in schema nop (isolated from lyly-storefront public tables).
create schema if not exists nop;
set search_path to nop, public;

create table if not exists settings (key text primary key, value jsonb not null);

create table if not exists customer_roles (
  id serial primary key, name text not null, system_name text unique, active boolean default true,
  is_system boolean default false, free_shipping boolean default false, tax_exempt boolean default false
);

create table if not exists customers (
  id serial primary key, guid uuid default gen_random_uuid() unique,
  email text, username text, password_hash text, first_name text default '', last_name text default '',
  gender text default '', dob date, company text default '', phone text default '', street text default '',
  city text default '', country text default '', newsletter boolean default false,
  is_guest boolean default true, active boolean default true, deleted boolean default false,
  admin_comment text default '', last_ip text default '', checkout_state jsonb default '{}'::jsonb,
  reset_token text, reset_token_expires timestamptz,
  created_at timestamptz default now(), last_login_at timestamptz, last_activity_at timestamptz default now(),
  last_page text default ''
);
create unique index if not exists customers_email_uq on customers (lower(email)) where email is not null and deleted = false;

create table if not exists customer_role_map (
  customer_id int references customers(id) on delete cascade, role_id int references customer_roles(id) on delete cascade,
  primary key (customer_id, role_id)
);

create table if not exists countries (
  id serial primary key, name text not null, code text, allows_billing boolean default true, allows_shipping boolean default true,
  published boolean default true, display_order int default 0
);
create table if not exists states (id serial primary key, country_id int references countries(id) on delete cascade, name text not null, abbreviation text default '', display_order int default 0);

create table if not exists addresses (
  id serial primary key, customer_id int references customers(id) on delete cascade,
  first_name text default '', last_name text default '', email text default '', company text default '',
  country_id int, state_id int, city text default '', address1 text default '', address2 text default '',
  zip text default '', phone text default '', fax text default '', created_at timestamptz default now()
);

create table if not exists tax_categories (id serial primary key, name text not null, rate float8 default 0, display_order int default 0);
create table if not exists currencies (
  id serial primary key, name text, code text unique, symbol text, rate float8 default 1, published boolean default true,
  is_primary boolean default false, display_order int default 0, custom_format text default ''
);

create table if not exists categories (
  id serial primary key, name text not null, slug text unique, description text default '', parent_id int,
  picture text default '', display_order int default 0, published boolean default true, show_on_home boolean default false,
  include_in_top_menu boolean default true, page_size int default 6, allow_page_size boolean default true,
  page_size_options text default '6, 3, 9', price_from float8, price_to float8, meta_title text default '',
  deleted boolean default false, created_at timestamptz default now()
);
create table if not exists manufacturers (
  id serial primary key, name text not null, slug text unique, description text default '', picture text default '',
  display_order int default 0, published boolean default true, deleted boolean default false, created_at timestamptz default now()
);

create table if not exists products (
  id serial primary key, name text not null, slug text unique, sku text default '', gtin text default '', mpn text default '',
  short_description text default '', full_description text default '', product_type text default 'simple',
  parent_grouped_id int, visible_individually boolean default true,
  price float8 default 0, old_price float8 default 0, product_cost float8 default 0, call_for_price boolean default false,
  customer_enters_price boolean default false, min_customer_price float8 default 0, max_customer_price float8 default 1000,
  is_gift_card boolean default false, gift_card_type text default 'virtual',
  is_download boolean default false, download_url text default '', has_sample boolean default false,
  is_shipping_enabled boolean default true, is_free_shipping boolean default false, additional_shipping_charge float8 default 0,
  weight float8 default 0, length float8 default 0, width float8 default 0, height float8 default 0,
  is_tax_exempt boolean default false, tax_category_id int,
  manage_stock boolean default true, stock_qty int default 100, display_stock_availability boolean default true,
  display_stock_quantity boolean default false, min_stock_qty int default 0, low_stock_activity text default 'nothing',
  notify_admin_below int default 1, backorders text default 'none', allow_back_in_stock boolean default true,
  order_min_qty int default 1, order_max_qty int default 10000, allowed_quantities text default '',
  disable_buy boolean default false, disable_wishlist boolean default false, available_for_preorder boolean default false,
  mark_as_new boolean default false, mark_new_start timestamptz, mark_new_end timestamptz,
  available_start timestamptz, available_end timestamptz,
  allow_reviews boolean default true, rating_sum int default 0, total_reviews int default 0,
  show_on_home boolean default false, published boolean default true, display_order int default 0,
  admin_comment text default '', meta_title text default '', deleted boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists product_pictures (id serial primary key, product_id int references products(id) on delete cascade, url text not null, alt text default '', display_order int default 0);
create table if not exists product_categories (product_id int references products(id) on delete cascade, category_id int references categories(id) on delete cascade, is_featured boolean default false, display_order int default 0, primary key (product_id, category_id));
create table if not exists product_manufacturers (product_id int references products(id) on delete cascade, manufacturer_id int references manufacturers(id) on delete cascade, is_featured boolean default false, display_order int default 0, primary key (product_id, manufacturer_id));
create table if not exists product_tags (id serial primary key, name text unique not null);
create table if not exists product_tag_map (product_id int references products(id) on delete cascade, tag_id int references product_tags(id) on delete cascade, primary key (product_id, tag_id));

create table if not exists product_attributes (id serial primary key, name text not null, description text default '');
create table if not exists product_attribute_mappings (
  id serial primary key, product_id int references products(id) on delete cascade, attribute_id int references product_attributes(id) on delete cascade,
  text_prompt text default '', is_required boolean default false, control_type text default 'dropdown', display_order int default 0
);
create table if not exists product_attribute_values (
  id serial primary key, mapping_id int references product_attribute_mappings(id) on delete cascade, name text not null,
  color_rgb text default '', price_adjustment float8 default 0, price_adjustment_percent boolean default false,
  weight_adjustment float8 default 0, is_preselected boolean default false, display_order int default 0
);

create table if not exists spec_attributes (id serial primary key, name text not null, display_order int default 0);
create table if not exists spec_options (id serial primary key, spec_attribute_id int references spec_attributes(id) on delete cascade, name text not null, color_rgb text default '', display_order int default 0);
create table if not exists product_spec_map (
  id serial primary key, product_id int references products(id) on delete cascade, option_id int references spec_options(id) on delete cascade,
  custom_value text default '', allow_filtering boolean default true, show_on_product_page boolean default true, display_order int default 0
);

create table if not exists tier_prices (id serial primary key, product_id int references products(id) on delete cascade, quantity int not null, price float8 not null, role_id int, start_at timestamptz, end_at timestamptz);
create table if not exists related_products (product_id int references products(id) on delete cascade, related_id int references products(id) on delete cascade, display_order int default 0, primary key (product_id, related_id));
create table if not exists cross_sell_products (product_id int references products(id) on delete cascade, cross_id int references products(id) on delete cascade, primary key (product_id, cross_id));

create table if not exists product_reviews (
  id serial primary key, product_id int references products(id) on delete cascade, customer_id int references customers(id) on delete set null,
  title text not null, body text not null, rating int not null default 5, approved boolean default true, reply_text text default '',
  helpful_yes int default 0, helpful_no int default 0, created_at timestamptz default now()
);
create table if not exists review_helpfulness (review_id int references product_reviews(id) on delete cascade, customer_id int, was_helpful boolean, primary key (review_id, customer_id));

create table if not exists checkout_attributes (
  id serial primary key, name text not null, text_prompt text default '', is_required boolean default false,
  shippable_only boolean default false, control_type text default 'dropdown', display_order int default 0
);
create table if not exists checkout_attribute_values (
  id serial primary key, attribute_id int references checkout_attributes(id) on delete cascade, name text not null,
  price_adjustment float8 default 0, is_preselected boolean default false, display_order int default 0
);

create table if not exists cart_items (
  id serial primary key, customer_id int references customers(id) on delete cascade, cart_type text default 'cart',
  product_id int references products(id) on delete cascade, quantity int default 1, attributes jsonb default '{}'::jsonb,
  attributes_desc text default '', customer_price float8 default 0, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists discounts (
  id serial primary key, name text not null, discount_type text default 'order_subtotal',
  use_percentage boolean default true, percentage float8 default 0, amount float8 default 0, max_amount float8,
  max_qty int, requires_coupon boolean default false, coupon_code text default '', is_cumulative boolean default false,
  start_at timestamptz, end_at timestamptz, limitation text default 'unlimited', limitation_times int default 1,
  min_subtotal float8 default 0, required_role_id int, apply_to_subcategories boolean default true,
  admin_comment text default '', active boolean default true, created_at timestamptz default now()
);
create table if not exists discount_products (discount_id int references discounts(id) on delete cascade, product_id int references products(id) on delete cascade, primary key (discount_id, product_id));
create table if not exists discount_categories (discount_id int references discounts(id) on delete cascade, category_id int references categories(id) on delete cascade, primary key (discount_id, category_id));
create table if not exists discount_manufacturers (discount_id int references discounts(id) on delete cascade, manufacturer_id int references manufacturers(id) on delete cascade, primary key (discount_id, manufacturer_id));
create table if not exists discount_usage (id serial primary key, discount_id int references discounts(id) on delete cascade, order_id int, customer_id int, created_at timestamptz default now());

create table if not exists shipping_methods (id serial primary key, name text not null, description text default '', rate float8 default 0, rate_per_kg float8 default 0, display_order int default 0, active boolean default true);
create table if not exists pickup_points (id serial primary key, name text not null, description text default '', address text default '', city text default '', country text default '', opening_hours text default '', fee float8 default 0, display_order int default 0, active boolean default true);
create table if not exists payment_methods (system_name text primary key, name text not null, description text default '', additional_fee float8 default 0, fee_percentage boolean default false, active boolean default true, display_order int default 0, kind text default 'offline');

create table if not exists orders (
  id serial primary key, guid uuid default gen_random_uuid() unique, custom_number text, customer_id int references customers(id) on delete set null,
  customer_email text default '', order_status text default 'Pending', shipping_status text default 'NotYetShipped', payment_status text default 'Pending',
  payment_method text default '', payment_method_name text default '', card_type text default '', card_name text default '', card_masked text default '',
  currency_code text default 'USD', currency_rate float8 default 1,
  subtotal float8 default 0, subtotal_discount float8 default 0, shipping_amount float8 default 0, shipping_discount float8 default 0,
  payment_fee float8 default 0, tax float8 default 0, order_discount float8 default 0, gift_card_amount float8 default 0,
  reward_points_used int default 0, reward_points_amount float8 default 0, total float8 default 0, refunded_amount float8 default 0,
  checkout_attributes_desc text default '', checkout_attributes jsonb default '{}'::jsonb,
  billing_address jsonb, shipping_address jsonb, shipping_method text default '', pickup_in_store boolean default false, pickup_point jsonb,
  customer_ip text default '', admin_comment text default '', deleted boolean default false,
  paid_at timestamptz, created_at timestamptz default now()
);
create table if not exists order_items (
  id serial primary key, guid uuid default gen_random_uuid(), order_id int references orders(id) on delete cascade,
  product_id int references products(id) on delete set null, product_name text, sku text default '', quantity int default 1,
  unit_price float8 default 0, price float8 default 0, discount_amount float8 default 0, attributes_desc text default '',
  attributes jsonb default '{}'::jsonb, weight float8 default 0, is_download boolean default false, download_count int default 0
);
create table if not exists order_notes (id serial primary key, order_id int references orders(id) on delete cascade, note text not null, display_to_customer boolean default false, created_at timestamptz default now());
create table if not exists shipments (
  id serial primary key, order_id int references orders(id) on delete cascade, tracking_number text default '', total_weight float8 default 0,
  admin_comment text default '', shipped_at timestamptz, delivered_at timestamptz, created_at timestamptz default now()
);
create table if not exists shipment_items (id serial primary key, shipment_id int references shipments(id) on delete cascade, order_item_id int references order_items(id) on delete cascade, quantity int default 1);

create table if not exists return_requests (
  id serial primary key, custom_number text, order_item_id int references order_items(id) on delete cascade, customer_id int references customers(id) on delete set null,
  quantity int default 1, returned_qty int default 0, reason text default '', requested_action text default '', comments text default '', staff_notes text default '',
  status text default 'Pending', created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists gift_cards (
  id serial primary key, order_item_id int references order_items(id) on delete set null, gift_card_type text default 'virtual',
  amount float8 default 0, is_activated boolean default false, code text unique, recipient_name text default '', recipient_email text default '',
  sender_name text default '', sender_email text default '', message text default '', is_notified boolean default false, created_at timestamptz default now()
);
create table if not exists gift_card_usage (id serial primary key, gift_card_id int references gift_cards(id) on delete cascade, order_id int references orders(id) on delete cascade, used_value float8 default 0, created_at timestamptz default now());

create table if not exists reward_points (
  id serial primary key, customer_id int references customers(id) on delete cascade, points int default 0, points_balance int default 0,
  used_amount float8 default 0, message text default '', order_id int, created_at timestamptz default now()
);
create table if not exists back_in_stock (id serial primary key, customer_id int references customers(id) on delete cascade, product_id int references products(id) on delete cascade, created_at timestamptz default now(), unique (customer_id, product_id));

create table if not exists newsletter_subscriptions (id serial primary key, guid uuid default gen_random_uuid(), email text unique not null, active boolean default true, created_at timestamptz default now());
create table if not exists campaigns (id serial primary key, name text not null, subject text default '', body text default '', sent_count int default 0, sent_at timestamptz, created_at timestamptz default now());
create table if not exists queued_emails (
  id serial primary key, priority text default 'High', from_email text default '', to_email text not null, to_name text default '',
  subject text default '', body text default '', sent_tries int default 0, sent_at timestamptz, created_at timestamptz default now()
);
create table if not exists message_templates (id serial primary key, name text unique not null, subject text default '', body text default '', active boolean default true);

create table if not exists topics (
  id serial primary key, system_name text unique, title text not null, slug text unique, body text default '',
  include_in_top_menu boolean default false, footer_column int default 0, published boolean default true,
  display_order int default 0, password text default ''
);
create table if not exists news (
  id serial primary key, title text not null, slug text unique, short text default '', full_text text default '',
  published boolean default true, allow_comments boolean default true, start_at timestamptz, end_at timestamptz, created_at timestamptz default now()
);
create table if not exists news_comments (id serial primary key, news_id int references news(id) on delete cascade, customer_id int references customers(id) on delete set null, title text default '', body text not null, approved boolean default true, created_at timestamptz default now());
create table if not exists blog_posts (
  id serial primary key, title text not null, slug text unique, body text default '', overview text default '', tags text default '',
  published boolean default true, allow_comments boolean default true, created_at timestamptz default now()
);
create table if not exists blog_comments (id serial primary key, post_id int references blog_posts(id) on delete cascade, customer_id int references customers(id) on delete set null, body text not null, approved boolean default true, created_at timestamptz default now());
create table if not exists polls (id serial primary key, name text not null, system_keyword text default '', published boolean default true, show_on_home boolean default true, allow_guests boolean default false, display_order int default 0, start_at timestamptz, end_at timestamptz);
create table if not exists poll_answers (id serial primary key, poll_id int references polls(id) on delete cascade, name text not null, votes int default 0, display_order int default 0);
create table if not exists poll_votes (answer_id int references poll_answers(id) on delete cascade, customer_id int references customers(id) on delete cascade, created_at timestamptz default now(), primary key (answer_id, customer_id));

create table if not exists search_terms (term text primary key, count int default 0, updated_at timestamptz default now());
create table if not exists activity_log (id serial primary key, customer_id int references customers(id) on delete set null, type text not null, comment text default '', entity text default '', entity_id int, ip text default '', created_at timestamptz default now());
create table if not exists system_log (id serial primary key, level text default 'Information', short_message text not null, full_message text default '', page_url text default '', customer_id int, created_at timestamptz default now());

create index if not exists products_published_idx on products (published, deleted);
create index if not exists cart_items_customer_idx on cart_items (customer_id, cart_type);
create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists product_categories_cat_idx on product_categories (category_id);
create index if not exists activity_created_idx on activity_log (created_at desc);
`
