import { q, one } from './db.js'
import { hashPassword, slugify } from './util.js'
import PRODUCT_IMAGES from './product-images.js'

// Demo data. Brands and product names are invented for this store.
const CATEGORIES = [
  ['Computers', null, 'Desktops, notebooks and software for work and play.', 1, true],
  ['Desktops', 'Computers', 'Towers and all-in-ones built to stay on your desk for years.', 1],
  ['Notebooks', 'Computers', 'Light, fast laptops for study, office and travel.', 2],
  ['Software', 'Computers', 'Productivity, creative and security software.', 3],
  ['Electronics', null, 'Cameras, phones and smart accessories.', 2, true],
  ['Camera & photo', 'Electronics', 'Mirrorless cameras, lenses and instant cameras.', 1],
  ['Cell phones', 'Electronics', 'Smartphones and rugged phones.', 2],
  ['Others', 'Electronics', 'Headphones, speakers and wearables.', 3],
  ['Apparel', null, 'Clothing, shoes and accessories for every day.', 3, true],
  ['Shoes', 'Apparel', 'Sneakers, runners and everyday shoes.', 1],
  ['Clothing', 'Apparel', 'Tees, jackets and knitwear.', 2],
  ['Accessories', 'Apparel', 'Bags, caps, belts and sunglasses.', 3],
  ['Digital downloads', null, 'Music albums, e-books and sample packs — delivered instantly.', 4],
  ['Books', null, 'Fiction, cooking and self-improvement titles.', 5],
  ['Jewelry', null, 'Handmade rings, bracelets and necklaces.', 6],
  ['Gift Cards', null, 'Physical and e-mail gift cards.', 7],
]

const MANUFACTURERS = [
  ['Aurora Tech', 'Notebooks and desktops engineered in Da Nang.'],
  ['Kestrel', 'Cameras and optics for curious travellers.'],
  ['Northwind Mobile', 'Phones and audio built to last.'],
  ['Lumen Studio', 'Creative software and digital content.'],
  ['Verdant Wear', 'Comfortable apparel made from recycled fibres.'],
  ['Paperleaf Press', 'Independent book publisher.'],
  ['Silver Lotus', 'Handmade jewelry from Hoi An workshops.'],
]

const SPECS = {
  'Screen size': ['13.3"', '14.0"', '15.6"', '6.1"', '6.7"'],
  'CPU type': ['Intel Core i5', 'Intel Core i7', 'AMD Ryzen 7', 'Apple-class ARM'],
  'Memory': ['8 GB', '16 GB', '32 GB'],
  'Storage': ['256 GB SSD', '512 GB SSD', '1 TB SSD'],
  'Color': ['Grey', 'Black', 'White', 'Blue', 'Red', 'Green'],
  'Material': ['Cotton', 'Leather', 'Recycled polyester', 'Sterling silver', 'Gold plated'],
}

const ATTR_NAMES = ['Processor', 'RAM', 'HDD', 'OS', 'Software', 'Color', 'Size', 'Print', 'Custom text', 'Format', 'Cover', 'Length']

// [name, cat, mfr, price, old, opts]
const PRODUCTS = [
  ['Aurora Tower Pro', 'Desktops', 'Aurora Tech', 1199, 1299, { home: true, specs: { 'CPU type': 'Intel Core i7', Memory: '16 GB', Storage: '1 TB SSD' }, attrs: { Processor: [['Core i5 2.5 GHz', 0, true], ['Core i7 3.4 GHz', 150]], RAM: [['8 GB', 0, true], ['16 GB', 60], ['32 GB', 180]], HDD: { type: 'radio', values: [['512 GB SSD', 0, true], ['1 TB SSD', 90]] }, OS: { type: 'radio', values: [['Linux', 0, true], ['Windows Pro', 120]] }, Software: { type: 'checkbox', values: [['Office Suite', 79], ['Photo Editor', 49], ['Antivirus', 25]] } }, tags: ['computer', 'awesome'], tier: [[3, 1150], [5, 1099]] }],
  ['Aurora Mini Desktop', 'Desktops', 'Aurora Tech', 649, 0, { specs: { 'CPU type': 'Intel Core i5', Memory: '8 GB', Storage: '256 GB SSD' }, tags: ['computer'] }],
  ['Aurora All-in-One 24', 'Desktops', 'Aurora Tech', 1049, 1149, { specs: { 'CPU type': 'AMD Ryzen 7', Memory: '16 GB', Storage: '512 GB SSD' }, tags: ['computer', 'cool'], newItem: true }],
  ['Aurora Air 13 Notebook', 'Notebooks', 'Aurora Tech', 899, 999, { home: true, specs: { 'Screen size': '13.3"', 'CPU type': 'Apple-class ARM', Memory: '8 GB', Storage: '256 GB SSD', Color: 'Grey' }, tags: ['laptop', 'awesome'], newItem: true }],
  ['Aurora Book 14 Business', 'Notebooks', 'Aurora Tech', 1099, 0, { specs: { 'Screen size': '14.0"', 'CPU type': 'Intel Core i7', Memory: '16 GB', Storage: '512 GB SSD', Color: 'Black' }, tags: ['laptop'] }],
  ['Aurora Creator 15.6', 'Notebooks', 'Aurora Tech', 1499, 1599, { specs: { 'Screen size': '15.6"', 'CPU type': 'AMD Ryzen 7', Memory: '32 GB', Storage: '1 TB SSD', Color: 'Grey' }, tags: ['laptop', 'cool'] }],
  ['Aurora Student 14', 'Notebooks', 'Aurora Tech', 549, 0, { specs: { 'Screen size': '14.0"', 'CPU type': 'Intel Core i5', Memory: '8 GB', Storage: '256 GB SSD', Color: 'Blue' }, tags: ['laptop', 'nice'] }],
  ['Aurora Gamer 15', 'Notebooks', 'Aurora Tech', 1349, 0, { specs: { 'Screen size': '15.6"', 'CPU type': 'Intel Core i7', Memory: '16 GB', Storage: '1 TB SSD', Color: 'Red' }, tags: ['laptop', 'game'], stock: 0 }],
  ['Lumen Photo Studio', 'Software', 'Lumen Studio', 79, 0, { download: true, ship: false, tags: ['software'], attrs: { Format: { type: 'radio', values: [['Windows', 0, true], ['macOS', 0]] } } }],
  ['Lumen Office Suite', 'Software', 'Lumen Studio', 99, 129, { download: true, ship: false, tags: ['software', 'nice'] }],
  ['ShieldGuard Antivirus 1-Year', 'Software', 'Lumen Studio', 29, 0, { download: true, ship: false, tags: ['software'] }],
  ['Kestrel M50 Mirrorless Camera', 'Camera & photo', 'Kestrel', 749, 829, { home: true, specs: { Color: 'Black' }, attrs: { Color: { type: 'color', values: [['Black', 0, true, '#1f1f1f'], ['Silver', 20, false, '#c9cdd1']] } }, tags: ['camera', 'cool'] }],
  ['Kestrel 50mm f/1.8 Lens', 'Camera & photo', 'Kestrel', 199, 0, { tags: ['camera'] }],
  ['Kestrel Instant Camera', 'Camera & photo', 'Kestrel', 89, 99, { attrs: { Color: { type: 'color', values: [['Mint', 0, true, '#a8d5c2'], ['Coral', 0, false, '#f28b74'], ['Sky', 0, false, '#8bb8f2']] } }, tags: ['camera', 'nice'], newItem: true }],
  ['Kestrel Action Cam 4K', 'Camera & photo', 'Kestrel', 249, 0, { tags: ['camera', 'awesome'] }],
  ['Northwind One 6.1', 'Cell phones', 'Northwind Mobile', 599, 649, { home: true, specs: { 'Screen size': '6.1"', Memory: '8 GB', Color: 'Green' }, attrs: { HDD: { name: 'Storage', type: 'radio', values: [['128 GB', 0, true], ['256 GB', 80]] }, Color: { type: 'color', values: [['Green', 0, true, '#3c6e57'], ['White', 0, false, '#f2f2f2'], ['Black', 0, false, '#222']] } }, tags: ['phone', 'cool'] }],
  ['Northwind One Max 6.7', 'Cell phones', 'Northwind Mobile', 799, 0, { specs: { 'Screen size': '6.7"', Memory: '16 GB', Color: 'Black' }, tags: ['phone'] }],
  ['Northwind Rugged X', 'Cell phones', 'Northwind Mobile', 399, 0, { specs: { 'Screen size': '6.1"', Color: 'Black' }, tags: ['phone', 'nice'] }],
  ['Northwind Buds Wireless', 'Others', 'Northwind Mobile', 79, 99, { tags: ['audio', 'nice'], tier: [[2, 74], [5, 69]] }],
  ['Northwind Studio Headphones', 'Others', 'Northwind Mobile', 179, 0, { tags: ['audio', 'awesome'] }],
  ['Pulse Smart Watch', 'Others', 'Northwind Mobile', 229, 249, { attrs: { Size: { type: 'radio', values: [['40 mm', 0, true], ['44 mm', 30]] } }, tags: ['wearable'] }],
  ['Pebble Bluetooth Speaker', 'Others', 'Northwind Mobile', 59, 0, { tags: ['audio'] }],
  ['Verdant Runner Sneakers', 'Shoes', 'Verdant Wear', 89, 109, { home: true, attrs: { Size: { required: true, values: [['39', 0], ['40', 0], ['41', 0], ['42', 0], ['43', 0]] }, Color: { type: 'color', required: true, values: [['White', 0, true, '#fafafa'], ['Black', 0, false, '#222'], ['Sage', 0, false, '#9db69b']] } }, specs: { Material: 'Recycled polyester' }, tags: ['shoes', 'awesome'] }],
  ['Verdant Leather Loafers', 'Shoes', 'Verdant Wear', 129, 0, { attrs: { Size: { required: true, values: [['40', 0], ['41', 0], ['42', 0], ['43', 0]] } }, specs: { Material: 'Leather', Color: 'Black' }, tags: ['shoes'] }],
  ['Verdant Trail Boots', 'Shoes', 'Verdant Wear', 149, 169, { attrs: { Size: { required: true, values: [['40', 0], ['41', 0], ['42', 0], ['43', 0], ['44', 0]] } }, specs: { Material: 'Leather', Color: 'Grey' }, tags: ['shoes', 'cool'] }],
  ['Custom Print T-Shirt', 'Clothing', 'Verdant Wear', 25, 0, { attrs: { Size: { required: true, values: [['S', 0], ['M', 0, true], ['L', 0], ['XL', 2]] }, 'Custom text': { type: 'textbox', prompt: 'Text to print (optional)' }, Print: { type: 'dropdown', values: [['No print', 0, true], ['Front print', 5], ['Front & back print', 9]] } }, specs: { Material: 'Cotton', Color: 'White' }, tags: ['shirt', 'nice'] }],
  ['Verdant Rain Jacket', 'Clothing', 'Verdant Wear', 119, 139, { attrs: { Size: { required: true, values: [['S', 0], ['M', 0], ['L', 0], ['XL', 0]] } }, specs: { Material: 'Recycled polyester', Color: 'Green' }, tags: ['jacket', 'cool'], newItem: true }],
  ['Merino Crew Sweater', 'Clothing', 'Verdant Wear', 79, 0, { attrs: { Size: { required: true, values: [['S', 0], ['M', 0], ['L', 0]] } }, specs: { Material: 'Cotton', Color: 'Blue' }, tags: ['sweater'] }],
  ['Linen Summer Shirt', 'Clothing', 'Verdant Wear', 45, 55, { specs: { Material: 'Cotton', Color: 'White' }, tags: ['shirt'] }],
  ['Canvas Weekender Bag', 'Accessories', 'Verdant Wear', 69, 0, { specs: { Material: 'Cotton', Color: 'Green' }, tags: ['bag', 'awesome'] }],
  ['Classic Baseball Cap', 'Accessories', 'Verdant Wear', 19, 0, { specs: { Material: 'Cotton', Color: 'Black' }, tags: ['cap'], tier: [[3, 17], [10, 15]] }],
  ['Polarized Sunglasses', 'Accessories', 'Verdant Wear', 49, 59, { tags: ['sunglasses', 'cool'] }],
  ['Leather Belt', 'Accessories', 'Verdant Wear', 35, 0, { attrs: { Length: { required: true, values: [['90 cm', 0], ['100 cm', 0], ['110 cm', 0]] } }, specs: { Material: 'Leather', Color: 'Black' }, tags: ['belt'] }],
  ['Night Market Vibes (Album)', 'Digital downloads', 'Lumen Studio', 9.99, 0, { download: true, ship: false, tags: ['music'] }],
  ['Lo-fi Study Beats (Album)', 'Digital downloads', 'Lumen Studio', 7.99, 0, { download: true, ship: false, tags: ['music', 'nice'] }],
  ['Photo Presets Pack', 'Digital downloads', 'Lumen Studio', 14.99, 19.99, { download: true, ship: false, tags: ['photo'] }],
  ['Free Wallpaper Collection', 'Digital downloads', 'Lumen Studio', 0, 0, { download: true, ship: false, tags: ['free'] }],
  ['The Quiet Kitchen', 'Books', 'Paperleaf Press', 24, 0, { attrs: { Cover: { type: 'radio', values: [['Paperback', 0, true], ['Hardcover', 8]] } }, tags: ['book', 'cooking'], home: true }],
  ['Small Habits, Big Days', 'Books', 'Paperleaf Press', 18, 22, { tags: ['book'] }],
  ['River of Lanterns (Novel)', 'Books', 'Paperleaf Press', 16, 0, { tags: ['book', 'novel'], newItem: true }],
  ['Silver Lotus Ring', 'Jewelry', 'Silver Lotus', 59, 0, { attrs: { Size: { required: true, values: [['6', 0], ['7', 0], ['8', 0]] } }, specs: { Material: 'Sterling silver' }, tags: ['jewelry', 'awesome'] }],
  ['Moonstone Bracelet', 'Jewelry', 'Silver Lotus', 89, 99, { specs: { Material: 'Sterling silver' }, tags: ['jewelry'] }],
  ['Golden Leaf Necklace', 'Jewelry', 'Silver Lotus', 129, 0, { specs: { Material: 'Gold plated' }, tags: ['jewelry', 'cool'], callForPrice: false }],
  ['$25 Virtual Gift Card', 'Gift Cards', null, 25, 0, { gift: 'virtual', ship: false, tags: ['gift'] }],
  ['$50 Physical Gift Card', 'Gift Cards', null, 50, 0, { gift: 'physical', tags: ['gift'] }],
  ['$100 Physical Gift Card', 'Gift Cards', null, 100, 0, { gift: 'physical', tags: ['gift'] }],
]

const LOREM = [
  'Designed for everyday use with a focus on comfort, durability and clean looks.',
  'Thoughtful details, carefully selected materials and a two-year warranty from LyLy Commerce.',
  'Ships within 24 hours from our Ho Chi Minh City warehouse. Free returns within 30 days.',
]

const TOPICS = [
  ['AboutUs', 'About us', 1, '<p>LyLy Commerce is a demo store built to show a complete e-commerce workflow: catalog, cart, checkout, customer accounts and a full administration area.</p><p>Everything here — products, brands and prices — is sample data.</p>'],
  ['ShippingInfo', 'Shipping & returns', 1, '<p>We ship nationwide with Ground, 2nd Day Air and Next Day Air. Orders over $100 ship free.</p><p>You can return any item within 30 days. Open <b>My account → Orders</b> and choose <b>Return item(s)</b>.</p>'],
  ['PrivacyInfo', 'Privacy notice', 1, '<p>We only collect the information needed to process your order. We never sell your data.</p>'],
  ['ConditionsOfUse', 'Conditions of use', 1, '<p>By placing an order you agree that this is a demo store and no real goods will be delivered.</p>'],
  ['ContactUs', 'Contact us', 0, '<p>Questions about an order? Send us a message and our team will reply within one business day.</p>'],
  ['HomepageText', 'Welcome to our store', 0, '<p>Browse computers, electronics, apparel, books and more. Create an account to track orders, save addresses and earn reward points.</p>'],
  ['CheckoutAsGuestOrRegister', 'Checkout as a guest or register', 0, '<p>Register with us for future convenience: fast and easy checkout, and easy access to your order history and status.</p>'],
  ['LoginRegistrationInfo', 'About login / registration', 0, '<p>Put your login / registration information here.</p>'],
]

const TEMPLATES = [
  ['Customer.WelcomeMessage', 'Welcome to %Store.Name%', 'Hello %Customer.FullName%,\n\nWelcome to %Store.Name%! You can now log in with %Customer.Email%.'],
  ['Customer.PasswordRecovery', '%Store.Name%. Password recovery', 'To change your password open this link:\n%Customer.PasswordRecoveryURL%'],
  ['Customer.EmailValidationMessage', '%Store.Name%. Email validation', 'To activate your account open %Customer.AccountActivationURL%'],
  ['OrderPlaced.CustomerNotification', '%Store.Name%. Order receipt #%Order.OrderNumber%', 'Hello %Order.CustomerFullName%,\n\nThanks for buying from %Store.Name%.\nOrder #%Order.OrderNumber%\nTotal: %Order.OrderTotal%\n\n%Order.Product(s)%'],
  ['OrderPlaced.StoreOwnerNotification', '%Store.Name%. Purchase receipt for order #%Order.OrderNumber%', '%Order.CustomerFullName% (%Order.CustomerEmail%) has just placed an order.\nTotal: %Order.OrderTotal%'],
  ['OrderPaid.CustomerNotification', '%Store.Name%. Order #%Order.OrderNumber% paid', 'Your order #%Order.OrderNumber% has been paid.'],
  ['ShipmentSent.CustomerNotification', 'Your order from %Store.Name% has been shipped.', 'Order #%Order.OrderNumber% has been shipped. Tracking number: %Shipment.TrackingNumber%'],
  ['ShipmentDelivered.CustomerNotification', 'Your order from %Store.Name% has been delivered.', 'Order #%Order.OrderNumber% has been delivered.'],
  ['OrderCompleted.CustomerNotification', '%Store.Name%. Your order completed', 'Your order #%Order.OrderNumber% has been completed.'],
  ['OrderCancelled.CustomerNotification', '%Store.Name%. Your order cancelled', 'Your order #%Order.OrderNumber% has been cancelled.'],
  ['OrderRefunded.CustomerNotification', '%Store.Name%. Order #%Order.OrderNumber% refunded', 'Order #%Order.OrderNumber% has been refunded: %Order.AmountRefunded%'],
  ['Service.EmailAFriend', '%Store.Name%. Referred Item', '%EmailAFriend.Email% was shopping on %Store.Name% and wanted to share: %Product.Name% %Product.ProductURLForCustomer%\n\n%EmailAFriend.PersonalMessage%'],
  ['Wishlist.EmailAFriend', '%Store.Name%. Wishlist', '%Wishlist.Email% was shopping on %Store.Name% and wanted to share a wishlist with you: %Wishlist.URLForCustomer%\n\n%Wishlist.PersonalMessage%'],
  ['Service.ContactUs', '%Store.Name%. Contact us', '%ContactUs.SenderName% (%ContactUs.SenderEmail%) wrote:\n\n%ContactUs.Body%'],
  ['NewsLetterSubscription.ActivationMessage', '%Store.Name%. Subscription activation message', 'Thanks for subscribing. Unsubscribe: %NewsLetterSubscription.DeactivationUrl%'],
  ['GiftCard.Notification', '%GiftCard.SenderName% has sent you a gift card for %Store.Name%', 'You have received a gift card for %Store.Name%.\nAmount: %GiftCard.Amount%\nCode: %GiftCard.CouponCode%\n\n%GiftCard.Message%'],
  ['Customer.BackInStock', '%Store.Name%. Back in stock notification', '%Product.Name% is in stock again: %BackInStockSubscription.ProductUrl%'],
  ['NewReturnRequest.CustomerNotification', '%Store.Name%. New return request', 'We received your return request #%ReturnRequest.CustomNumber%.'],
  ['ReturnRequestStatusChanged.CustomerNotification', '%Store.Name%. Return request status was changed', 'Return request #%ReturnRequest.CustomNumber% is now %ReturnRequest.Status%.'],
  ['Product.ProductReview', '%Store.Name%. New product review.', 'A new product review has been written for "%ProductReview.ProductName%".'],
  ['QuantityBelow.StoreOwnerNotification', '%Store.Name%. Quantity below notification. %Product.Name%', '%Product.Name% (ID: %Product.ID%) low quantity. Quantity: %Product.StockQuantity%'],
]

export async function seed() {
  const ins = async (sql, params) => (await one(sql + ' returning id', params)).id

  // roles & customers
  const roles = {}
  for (const [name, sys, free] of [['Administrators', 'Administrators'], ['Registered', 'Registered'], ['Guests', 'Guests'], ['VIP', 'VIP', true]]) {
    roles[sys] = await ins('insert into customer_roles (name, system_name, is_system, free_shipping) values ($1,$2,$3,$4)', [name, sys, sys !== 'VIP', !!free])
  }
  const people = [
    ['admin@yourstore.com', 'admin', 'John', 'Admin', 'M', ['Administrators', 'Registered']],
    ['victoria.tran@example.com', '123456', 'Victoria', 'Tran', 'F', ['Registered']],
    ['steve.nguyen@example.com', '123456', 'Steve', 'Nguyen', 'M', ['Registered', 'VIP']],
    ['arthur.holmes@example.com', '123456', 'Arthur', 'Holmes', 'M', ['Registered']],
    ['james.pan@example.com', '123456', 'James', 'Pan', 'M', ['Registered']],
    ['brenda.lindgren@example.com', '123456', 'Brenda', 'Lindgren', 'F', ['Registered']],
  ]
  const customers = []
  for (const [i, [email, pw, fn, ln, g, rs]] of people.entries()) {
    const id = await ins(`insert into customers (email, password_hash, first_name, last_name, gender, is_guest, newsletter, created_at, last_activity_at)
      values ($1,$2,$3,$4,$5,false,$6, now() - ($7 || ' days')::interval, now() - ($7 || ' hours')::interval)`, [email, hashPassword(pw), fn, ln, g, i % 2 === 0, String(40 - i * 5)])
    for (const r of rs) await q('insert into customer_role_map values ($1,$2)', [id, roles[r]])
    customers.push({ id, email, fn, ln })
  }

  // geography, currency, tax
  const countries = {}
  const cl = [['United States', 'US'], ['Vietnam', 'VN'], ['Canada', 'CA'], ['United Kingdom', 'GB'], ['Germany', 'DE'], ['France', 'FR'], ['Australia', 'AU'], ['Japan', 'JP'], ['Singapore', 'SG']]
  for (const [i, [n, c]] of cl.entries()) countries[c] = await ins('insert into countries (name, code, display_order) values ($1,$2,$3)', [n, c, i])
  for (const s of ['New York', 'California', 'Texas', 'Washington', 'Florida']) await q('insert into states (country_id, name) values ($1,$2)', [countries.US, s])
  for (const s of ['Ho Chi Minh City', 'Ha Noi', 'Da Nang', 'Can Tho', 'Hai Phong', 'Khanh Hoa']) await q('insert into states (country_id, name) values ($1,$2)', [countries.VN, s])
  for (const s of ['Ontario', 'Quebec', 'British Columbia']) await q('insert into states (country_id, name) values ($1,$2)', [countries.CA, s])
  for (const [i, [n, c, s, r, p]] of [['US Dollar', 'USD', '$', 1, true], ['Euro', 'EUR', '€', 0.92, false], ['Vietnamese Dong', 'VND', '₫', 25400, false]].entries()) {
    await q('insert into currencies (name, code, symbol, rate, is_primary, display_order) values ($1,$2,$3,$4,$5,$6)', [n, c, s, r, p, i])
  }
  const tax = {}
  for (const [n, r] of [['Books', 0], ['Electronics & Software', 8], ['Downloadable Products', 0], ['Jewelry', 5], ['Apparel', 5]]) tax[n] = await ins('insert into tax_categories (name, rate) values ($1,$2)', [n, r])
  const taxFor = (cat) => ({ Books: tax.Books, Jewelry: tax.Jewelry, 'Digital downloads': tax['Downloadable Products'] }[cat] ||
    (['Shoes', 'Clothing', 'Accessories'].includes(cat) ? tax.Apparel : ['Gift Cards'].includes(cat) ? null : tax['Electronics & Software']))

  // catalog structure
  const cats = {}
  for (const [name, parent, desc, order, home] of CATEGORIES) {
    cats[name] = await ins('insert into categories (name, slug, description, parent_id, display_order, show_on_home) values ($1,$2,$3,$4,$5,$6)',
      [name, slugify(name), desc, parent ? cats[parent] : null, order, !!home || ['Notebooks', 'Camera & photo', 'Shoes'].includes(name)])
  }
  const mfrs = {}
  for (const [i, [n, d]] of MANUFACTURERS.entries()) mfrs[n] = await ins('insert into manufacturers (name, slug, description, display_order) values ($1,$2,$3,$4)', [n, slugify(n), d, i])
  const specOpt = {}
  for (const [i, [name, opts]] of Object.entries(SPECS).entries()) {
    const sid = await ins('insert into spec_attributes (name, display_order) values ($1,$2)', [name, i])
    for (const [j, o] of opts.entries()) specOpt[`${name}|${o}`] = await ins('insert into spec_options (spec_attribute_id, name, display_order) values ($1,$2,$3)', [sid, o, j])
  }
  const attrIds = {}
  for (const n of [...ATTR_NAMES, 'Storage']) attrIds[n] = await ins('insert into product_attributes (name) values ($1)', [n])
  const tagIds = {}

  const productIds = {}
  for (const [i, [name, cat, mfr, price, old, o]] of PRODUCTS.entries()) {
    const slug = slugify(name)
    const sku = `${slugify(cat).slice(0, 3).toUpperCase()}-${String(1000 + i)}`
    const pid = await ins(`insert into products (name, slug, sku, short_description, full_description, price, old_price, product_cost,
        is_gift_card, gift_card_type, is_download, download_url, is_shipping_enabled, weight, stock_qty, show_on_home, mark_as_new,
        tax_category_id, created_at, display_order, call_for_price)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now() - ($19 || ' days')::interval, $20, $21)`, [
      name, slug, sku, `${name} — ${LOREM[i % 3].toLowerCase()}`,
      `<p>${LOREM[0]}</p><p>${LOREM[1]}</p><ul><li>Category: ${cat}</li>${mfr ? `<li>Brand: ${mfr}</li>` : ''}<li>SKU: ${sku}</li></ul><p>${LOREM[2]}</p>`,
      price, old, Math.round(price * 0.6), !!o.gift, o.gift || 'virtual', !!o.download, o.download ? `/api/sample-download/${slug}.txt` : '',
      o.ship !== false, o.ship === false ? 0 : 1 + (i % 4) * 0.5, o.stock ?? 40 + (i * 7) % 60, !!o.home, !!o.newItem, taxFor(cat),
      String(o.newItem ? i % 5 : 30 + i), i, !!o.callForPrice,
    ])
    productIds[name] = pid
    if (PRODUCT_IMAGES[slug]) await q('insert into product_pictures (product_id, url, alt) values ($1,$2,$3)', [pid, PRODUCT_IMAGES[slug], name])
    await q('insert into product_categories (product_id, category_id) values ($1,$2)', [pid, cats[cat]])
    if (mfr) await q('insert into product_manufacturers (product_id, manufacturer_id) values ($1,$2)', [pid, mfrs[mfr]])
    for (const [k, v] of Object.entries(o.specs || {})) if (specOpt[`${k}|${v}`]) await q('insert into product_spec_map (product_id, option_id) values ($1,$2)', [pid, specOpt[`${k}|${v}`]])
    for (const t of o.tags || []) {
      tagIds[t] ||= await ins('insert into product_tags (name) values ($1)', [t])
      await q('insert into product_tag_map values ($1,$2)', [pid, tagIds[t]])
    }
    for (const [qty, p] of o.tier || []) await q('insert into tier_prices (product_id, quantity, price) values ($1,$2,$3)', [pid, qty, p])
    let order = 0
    for (const [attr, def] of Object.entries(o.attrs || {})) {
      const spec = Array.isArray(def) ? { values: def } : def
      const mid = await ins('insert into product_attribute_mappings (product_id, attribute_id, text_prompt, is_required, control_type, display_order) values ($1,$2,$3,$4,$5,$6)',
        [pid, attrIds[spec.name || attr] || attrIds[attr], spec.prompt || '', spec.required ?? ['Processor', 'RAM', 'HDD', 'OS'].includes(attr), spec.type || 'dropdown', order++])
      for (const [j, [vn, adj, pre, rgb]] of (spec.values || []).entries()) {
        await q('insert into product_attribute_values (mapping_id, name, price_adjustment, is_preselected, color_rgb, display_order) values ($1,$2,$3,$4,$5,$6)', [mid, vn, adj || 0, !!pre, rgb || '', j])
      }
    }
  }
  const rel = [['Aurora Air 13 Notebook', 'Aurora Book 14 Business'], ['Aurora Air 13 Notebook', 'Lumen Office Suite'], ['Aurora Air 13 Notebook', 'Canvas Weekender Bag'],
    ['Kestrel M50 Mirrorless Camera', 'Kestrel 50mm f/1.8 Lens'], ['Kestrel M50 Mirrorless Camera', 'Photo Presets Pack'], ['Northwind One 6.1', 'Northwind Buds Wireless'],
    ['Northwind One 6.1', 'Pulse Smart Watch'], ['Verdant Runner Sneakers', 'Classic Baseball Cap'], ['Aurora Tower Pro', 'ShieldGuard Antivirus 1-Year']]
  for (const [a, b] of rel) {
    await q('insert into related_products (product_id, related_id) values ($1,$2) on conflict do nothing', [productIds[a], productIds[b]])
    await q('insert into related_products (product_id, related_id) values ($1,$2) on conflict do nothing', [productIds[b], productIds[a]])
  }
  for (const [a, b] of [['Aurora Air 13 Notebook', 'ShieldGuard Antivirus 1-Year'], ['Kestrel M50 Mirrorless Camera', 'Kestrel Instant Camera'], ['Northwind One 6.1', 'Pebble Bluetooth Speaker']]) {
    await q('insert into cross_sell_products values ($1,$2) on conflict do nothing', [productIds[a], productIds[b]])
  }
  // reviews
  const reviewTexts = [['Great value', 'Exactly as described and arrived quickly.', 5], ['Pretty good', 'Works well, packaging could be better.', 4], ['Okay', 'Does the job, nothing special.', 3]]
  for (const [i, name] of ['Aurora Air 13 Notebook', 'Kestrel M50 Mirrorless Camera', 'Northwind One 6.1', 'Verdant Runner Sneakers', 'The Quiet Kitchen', 'Aurora Tower Pro'].entries()) {
    for (let j = 0; j < 2 + (i % 2); j++) {
      const [t, b, r] = reviewTexts[(i + j) % 3]
      await q('insert into product_reviews (product_id, customer_id, title, body, rating, helpful_yes) values ($1,$2,$3,$4,$5,$6)', [productIds[name], customers[1 + ((i + j) % 5)].id, t, b, r, j])
    }
    await q('update products set rating_sum = (select coalesce(sum(rating),0) from product_reviews where product_id = $1 and approved), total_reviews = (select count(*) from product_reviews where product_id = $1 and approved) where id = $1', [productIds[name]])
  }

  // checkout configuration
  for (const [i, [n, d, r, kg]] of [['Ground', 'Compared to other methods, ground shipping is the cheapest way to ship.', 8, 0.5], ['Next Day Air', 'The one day air shipping.', 25, 1], ['2nd Day Air', 'The two day air shipping.', 15, 0.8]].entries()) {
    await q('insert into shipping_methods (name, description, rate, rate_per_kg, display_order) values ($1,$2,$3,$4,$5)', [n, d, r, kg, i])
  }
  await q("insert into pickup_points (name, description, address, city, country, opening_hours, fee) values ('LyLy Store — District 1', 'Pick up your order at our flagship store', '12 Nguyen Hue', 'Ho Chi Minh City', 'Vietnam', 'Mon–Sun 9:00–21:00', 0)")
  await q("insert into pickup_points (name, description, address, city, country, opening_hours, fee) values ('LyLy Store — Thao Dien', 'Pick up your order in Thu Duc City', '25 Quoc Huong', 'Thu Duc City', 'Vietnam', 'Mon–Sat 9:00–20:00', 1.5)")
  const pms = [
    ['Payments.CheckMoneyOrder', 'Check / Money Order', 'Mail your check or money order to LyLy Commerce. Your order ships once payment is received.', 0, 'offline'],
    ['Payments.Manual', 'Credit Card', 'Pay by credit card (test mode — use any test card number such as 4111 1111 1111 1111).', 0, 'card'],
    ['Payments.CashOnDelivery', 'Cash On Delivery (COD)', 'Pay the courier in cash when your order arrives.', 2, 'offline'],
    ['Payments.PayPalStandard', 'PayPal (sandbox)', 'You will be redirected to a simulated PayPal page to complete the payment.', 0, 'redirect'],
  ]
  for (const [i, [s, n, d, f, k]] of pms.entries()) await q('insert into payment_methods (system_name, name, description, additional_fee, display_order, kind) values ($1,$2,$3,$4,$5,$6)', [s, n, d, f, i, k])
  const gw = await ins("insert into checkout_attributes (name, text_prompt, is_required, shippable_only, control_type) values ('Gift wrapping', 'Gift wrapping', false, true, 'dropdown')")
  await q('insert into checkout_attribute_values (attribute_id, name, price_adjustment, is_preselected, display_order) values ($1,$2,0,true,0), ($1,$3,10,false,1)', [gw, 'No', 'Yes'])

  // promotions
  const d1 = await ins("insert into discounts (name, discount_type, use_percentage, percentage, requires_coupon, coupon_code) values ('Welcome 10% off sub-total', 'order_subtotal', true, 10, true, 'WELCOME10')")
  await ins("insert into discounts (name, discount_type, use_percentage, percentage, requires_coupon, coupon_code) values ('Free shipping coupon', 'shipping', true, 100, true, 'SHIPFREE')")
  await ins("insert into discounts (name, discount_type, use_percentage, amount, requires_coupon, coupon_code, min_subtotal, limitation, limitation_times) values ('$20 off orders over $200', 'order_total', false, 20, true, 'SAVE20', 200, 'n_times_per_customer', 1)")
  const d4 = await ins("insert into discounts (name, discount_type, use_percentage, percentage, requires_coupon, is_cumulative) values ('Apparel week: 5% off', 'categories', true, 5, false, true)")
  await q('insert into discount_categories values ($1,$2)', [d4, cats.Apparel])
  const d5 = await ins("insert into discounts (name, discount_type, use_percentage, amount, requires_coupon) values ('$2 off selected books', 'products', false, 2, false)")
  await q('insert into discount_products values ($1,$2)', [d5, productIds['Small Habits, Big Days']])
  void d1
  await q("insert into gift_cards (gift_card_type, amount, is_activated, code, recipient_name, sender_name, message) values ('virtual', 25, true, 'GIFT-DEMO-25', 'Demo customer', 'LyLy Commerce', 'Enjoy!')")
  await q("insert into gift_cards (gift_card_type, amount, is_activated, code, recipient_name, sender_name) values ('virtual', 100, true, 'GIFT-DEMO-100', 'Demo customer', 'LyLy Commerce')")

  // content
  for (const [i, [sys, title, col, body]] of TOPICS.entries()) {
    await q('insert into topics (system_name, title, slug, body, footer_column, display_order) values ($1,$2,$3,$4,$5,$6)', [sys, title, slugify(title), body, col, i])
  }
  for (const [n, s, b] of TEMPLATES) await q('insert into message_templates (name, subject, body) values ($1,$2,$3)', [n, s, b])
  const newsItems = [
    ['About LyLy Commerce', 'This demo store shows how a complete online shop works — from catalog to admin.', '<p>LyLy Commerce includes product attributes, tier prices, discounts, gift cards, reward points, return requests, polls, blog and much more.</p>'],
    ['New online store is open!', 'The new LyLy Commerce store is open now! We hope you enjoy the new look.', '<p>Take a look around and let us know what you think in the comments.</p>'],
    ['Weekend sale on apparel', 'All apparel is 5% off automatically this week — no code required.', '<p>The discount is applied in your cart. Combine it with WELCOME10 for even more savings.</p>'],
  ]
  for (const [i, [t, s, f]] of newsItems.entries()) await q("insert into news (title, slug, short, full_text, created_at) values ($1,$2,$3,$4, now() - ($5 || ' days')::interval)", [t, slugify(t), s, f, String(i * 6)])
  const posts = [
    ['How to choose your first mirrorless camera', 'camera, photography, guide', 'Sensor size, lenses and battery life — what really matters.'],
    ['Five tips for a calmer workspace', 'workspace, productivity', 'Small changes to your desk that make long days easier.'],
    ['Packing light for a weekend trip', 'travel, apparel', 'One bag, three outfits and zero stress.'],
  ]
  for (const [i, [t, tags, ov]] of posts.entries()) {
    await q("insert into blog_posts (title, slug, overview, body, tags, created_at) values ($1,$2,$3,$4,$5, now() - ($6 || ' days')::interval)", [t, slugify(t), ov, `<p>${ov}</p><p>${LOREM.join(' ')}</p>`, tags, String(i * 20 + 3)])
  }
  const poll = await ins("insert into polls (name, system_keyword, show_on_home) values ('Do you like LyLy Commerce?', 'HomepagePoll', true)")
  for (const [i, a] of ['Excellent', 'Good', 'Poor', 'Very bad'].entries()) await q('insert into poll_answers (poll_id, name, votes, display_order) values ($1,$2,$3,$4)', [poll, a, [12, 5, 1, 0][i], i])
  for (const e of ['news.fan@example.com', 'deal.hunter@example.com']) await q('insert into newsletter_subscriptions (email) values ($1)', [e])

  // addresses + sample orders for the dashboard/reports
  for (const c of customers.slice(1)) {
    await q(`insert into addresses (customer_id, first_name, last_name, email, country_id, state_id, city, address1, zip, phone)
      values ($1,$2,$3,$4,$5,(select id from states where country_id = $5 limit 1),'Ho Chi Minh City','123 Le Loi','700000','0901234567')`, [c.id, c.fn, c.ln, c.email, countries.VN])
  }
  const all = await q('select id, name, sku, price, weight, is_download from products where price > 0 order by id')
  const statuses = [['Complete', 'Delivered', 'Paid'], ['Processing', 'Shipped', 'Paid'], ['Pending', 'NotYetShipped', 'Pending'], ['Complete', 'Delivered', 'Paid'], ['Cancelled', 'NotYetShipped', 'Voided'], ['Processing', 'NotYetShipped', 'Paid']]
  for (let n = 0; n < 28; n++) {
    const c = customers[1 + (n % 5)]
    const [os, ss, ps] = statuses[n % statuses.length]
    const picks = [all[(n * 7) % all.length], all[(n * 11 + 3) % all.length]].slice(0, 1 + (n % 2))
    const sub = picks.reduce((s, p, k) => s + p.price * (1 + ((n + k) % 2)), 0)
    const ship = sub >= 100 ? 0 : 8
    const addr = { firstName: c.fn, lastName: c.ln, email: c.email, country: 'Vietnam', state: 'Ho Chi Minh City', city: 'Ho Chi Minh City', address1: '123 Le Loi', zip: '700000', phone: '0901234567' }
    const oid = await ins(`insert into orders (customer_id, customer_email, order_status, shipping_status, payment_status, payment_method, payment_method_name,
        subtotal, shipping_amount, total, billing_address, shipping_address, shipping_method, created_at, paid_at)
      values ($1,$2,$3,$4,$5,'Payments.Manual','Credit Card',$6,$7,$8,$9::jsonb,$9::jsonb,'Ground', now() - ($10 || ' hours')::interval, case when $5 = 'Paid' then now() - ($10 || ' hours')::interval end)`,
    [c.id, c.email, os, ss, ps, sub, ship, sub + ship, addr, String(n * 26 + 2)])
    await q('update orders set custom_number = id::text where id = $1', [oid])
    for (const [k, p] of picks.entries()) {
      const qty = 1 + ((n + k) % 2)
      await q('insert into order_items (order_id, product_id, product_name, sku, quantity, unit_price, price, weight, is_download) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [oid, p.id, p.name, p.sku, qty, p.price, p.price * qty, p.weight, p.is_download])
    }
    await q('insert into order_notes (order_id, note) values ($1, $2)', [oid, 'Order placed'])
  }
  for (const t of ['laptop', 'camera', 'shoes', 'gift card', 'phone']) await q('insert into search_terms (term, count) values ($1,$2)', [t, 3 + t.length])
  await q("insert into settings (key, value) values ('store', $1::jsonb) on conflict do nothing", [{}])
}
