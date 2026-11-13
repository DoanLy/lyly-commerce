# HANDOFF — LyLy Commerce

Cập nhật lần cuối: 2026-11-13 · version 1.0.2

## 1. Tổng quan

| Mục | Giá trị |
| --- | --- |
| Source | `D:\CODE_2026\lyly-commerce` |
| GitHub | `DoanLy/lyly-commerce` |
| Vercel | project `lylynew-commerce` → https://lylynew-commerce.vercel.app (region `icn1` — Seoul, gần DB) |
| Database | Supabase project `qbumdsvcdgrztplzhtxc`, **schema `nop`** (dùng chung project với lyly-storefront nhưng không đụng schema `public`) |
| DB host | Session pooler `aws-1-ap-northeast-2.pooler.supabase.com:5432` |
| Dev local | `npm run dev` → http://localhost:5180 (PGlite nếu không có `DATABASE_URL`) |

> ⚠️ Schema `nop` trên Supabase là dữ liệu thật của bản deploy. Không có staging. Test thoải mái trên local (PGlite).

## 2. Cấu trúc

```
api/index.js            # Vercel function duy nhất (Hobby giới hạn 12 function) → server/router.js
server/
  db.js                 # adapter: postgres (DATABASE_URL) hoặc PGlite (local)
  schema.js             # DDL toàn bộ bảng schema nop
  seed.js               # dữ liệu mẫu (46 sản phẩm, 28 đơn, khách, discount, topic, news, blog, poll…)
  migrate.js            # ensureSchema(): tạo schema + seed khi settings.__schema.version < SCHEMA_VERSION
  core.js               # settings, session cookie, discount/thuế/ship/gift card/reward points (computeTotals)
  orders.js             # markPaid, cancel, refund, checkComplete, gift card khi mua
  routes/store.js       # catalog, search, product, review, news, blog, poll, contact, newsletter
  routes/account.js     # auth, tài khoản, địa chỉ, đơn, đổi trả, download, cart, wishlist, coupon
  routes/checkout.js    # checkout 1 trang, xác nhận đơn, PayPal sandbox giả lập
  routes/admin.js       # /api/admin/*: CRUD generic (object E), products, orders, customers, reports, settings
src/store/              # storefront (StoreApp.jsx, layout.jsx, ui.jsx, pages/*, store.css)
src/admin/              # admin (AdminApp.jsx, Layout, EntityPage generic + entities.js, Products, Orders, Customers, Settings, Reports, admin.css)
scripts/migrate.mjs     # chạy migrate lên DB của DATABASE_URL
scripts/smoke.mjs       # smoke test API trên PGlite
```

## 3. Thêm bảng / cột

1. Sửa `server/schema.js` (dùng `create table if not exists` / `alter table … add column if not exists`).
2. Tăng `SCHEMA_VERSION` trong `server/migrate.js` → lần gọi API đầu tiên sau deploy sẽ chạy lại DDL.
3. Nếu là entity admin đơn giản: thêm vào object `E` (server/routes/admin.js) + config trong `src/admin/entities.js`.

## 4. Biến môi trường (Vercel + `.env.local`)

- `DATABASE_URL` — chuỗi kết nối session pooler (xem `.env.example`)
- `SESSION_SECRET` — chuỗi ngẫu nhiên dài để ký cookie đăng nhập

## 5. Quy ước ID cho automation

Mọi phần tử tương tác có `id` kebab-case ổn định:
storefront dùng tiền tố theo trang (`header-*`, `catalog-*`, `product-*`, `cart-*`, `checkout-*`, `account-*`, `register-*`, `login-*`…);
admin dùng `admin-*` (`admin-nav-orders`, `admin-login-email`, `admin-product-save`, `admin-order-row-12`…). Label luôn có `htmlFor`.

## 6. Tài khoản & dữ liệu demo

- Admin: `admin@yourstore.com` / `admin` (nên đổi mật khẩu trong Admin → Customers sau khi deploy)
- Khách: `victoria.tran@example.com` … mật khẩu `123456`
- Coupon: `WELCOME10`, `SHIPFREE`, `SAVE20`; gift card `GIFT-DEMO-25`, `GIFT-DEMO-100`
- Email không gửi thật: mọi email (đặt hàng, quên mật khẩu, email a friend…) vào **Admin → System → Queued emails**.

## 7. Giới hạn đã biết

- Trình soạn thảo nội dung là textarea HTML thô.
- Admin chưa sửa được địa chỉ của khách (chỉ xem).
- Ảnh sản phẩm mẫu là ảnh CC0 từ StockSnap (link trong `server/product-images.js`, gắn bằng `scripts/apply-product-images.mjs`); ảnh upload trong admin lưu dạng data URL trong DB (~900px). Sản phẩm không có ảnh sẽ hiện hình minh họa tự vẽ.
- Chưa có đa ngôn ngữ, đa cửa hàng, vendor, affiliate, forum.

## 8. Ghi chú kỹ thuật

- Driver `postgres` tự serialize tham số jsonb → trong `server/db.js` **không** được `JSON.stringify` object khi chạy với `DATABASE_URL`
  (PGlite thì ngược lại, cần stringify). Lỗi này từng làm địa chỉ đơn hàng/settings bị lưu thành chuỗi JSON; đã sửa dữ liệu ngày 2026-11-13.
