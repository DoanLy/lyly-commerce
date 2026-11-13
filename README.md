# LyLy Commerce

Cửa hàng demo đầy đủ tính năng theo mô hình nopCommerce (storefront + trang quản trị), giao diện theo phong cách LyLy Storefront.
Toàn bộ thương hiệu, sản phẩm và giá là dữ liệu mẫu tự tạo.

- Storefront: `/`
- Admin: `/admin` (tài khoản demo: `admin@yourstore.com` / `admin`)
- Khách hàng mẫu: `victoria.tran@example.com`, `steve.nguyen@example.com` (VIP, free ship)… mật khẩu `123456`
- Mã giảm giá mẫu: `WELCOME10`, `SHIPFREE`, `SAVE20` (đơn từ $200); gift card `GIFT-DEMO-25`, `GIFT-DEMO-100`
- Thẻ test: `4111 1111 1111 1111`, ngày hết hạn bất kỳ trong tương lai, CVV 3 số

## Chạy local

```bash
npm install
npm run dev        # http://localhost:5180
```

Không có `DATABASE_URL` thì backend tự dùng **PGlite** (Postgres nhúng, lưu ở `./.pglite`) và tự tạo schema + dữ liệu mẫu.
Muốn chạy với Supabase thì tạo `.env.local` theo `.env.example`.

## Kiến trúc

| Phần | Công nghệ |
| --- | --- |
| Frontend | React 19 + Vite 8 + react-router 7, `src/store` (storefront), `src/admin` (admin, lazy-load) |
| Backend | 1 Vercel Function `api/index.js` → router `server/router.js` |
| DB | Postgres (Supabase), toàn bộ bảng nằm trong schema **`nop`**, tách biệt với `public` của lyly-storefront |

Chi tiết xem [HANDOFF.md](HANDOFF.md).
