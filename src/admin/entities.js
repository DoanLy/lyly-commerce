// Config for the generic list/edit pages (EntityPage). Keys match server/routes/admin.js `E`.
// list col types: text | bool | date | datetime | money | badge | truncate | number | image
// form field types: text | textarea | html | int | number | money | bool | datetime | date | select | email | color | image | info
export const CONTROL_TYPES = [['dropdown', 'Drop-down list'], ['radio', 'Radio button list'], ['checkbox', 'Checkboxes'], ['color', 'Color squares'], ['textbox', 'Textbox'], ['multiline', 'Multiline textbox']]
export const DISCOUNT_TYPES = [['order_total', 'Assigned to order total'], ['order_subtotal', 'Assigned to order subtotal'], ['products', 'Assigned to products'], ['categories', 'Assigned to categories'], ['manufacturers', 'Assigned to manufacturers'], ['shipping', 'Assigned to shipping']]
export const LIMITATIONS = [['unlimited', 'Unlimited'], ['n_times', 'N times only'], ['n_times_per_customer', 'N times per customer']]
export const RETURN_STATUSES = ['Pending', 'Received', 'ReturnAuthorized', 'ItemsRepaired', 'ItemsRefunded', 'RequestRejected', 'Cancelled']
export const LOG_LEVELS = ['Debug', 'Information', 'Warning', 'Error', 'Fatal']
const BOOL_FILTER = [['', 'All'], ['true', 'Yes'], ['false', 'No']]

const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra })
const C = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra })

const parentCategoryOptions = (lk, row) => [['', '[None]'], ...(lk.categoryOptions || []).filter((c) => c.id !== row?.id).map((c) => [c.id, c.name])]

export const ENTITIES = {
  categories: {
    title: 'Categories', single: 'category', group: 'Catalog',
    list: [C('picture', 'Picture', 'image'), C('name', 'Name'), C('products', 'Products', 'number'), C('published', 'Published', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [
      { title: 'Category info', fields: [F('name', 'Name', 'text', { required: true }), F('description', 'Description', 'html'), F('parent_id', 'Parent category', 'select', { options: parentCategoryOptions, int: true }), F('picture', 'Picture', 'image')] },
      { title: 'Display', fields: [F('published', 'Published', 'bool'), F('show_on_home', 'Show on home page', 'bool'), F('include_in_top_menu', 'Include in top menu', 'bool'), F('display_order', 'Display order', 'int'),
        F('page_size', 'Page size', 'int'), F('allow_page_size', 'Allow customers to select page size', 'bool'), F('page_size_options', 'Page size options', 'text', { hint: 'Comma separated, e.g. 6, 3, 9' }),
        F('price_from', 'Price range from', 'money'), F('price_to', 'Price range to', 'money')] },
      { title: 'SEO', fields: [F('slug', 'Search engine friendly page name', 'text', { hint: 'Leave empty to generate from the name' }), F('meta_title', 'Meta title')] },
    ],
    defaults: { published: true, include_in_top_menu: true, display_order: 0, page_size: 6, allow_page_size: true, page_size_options: '6, 3, 9' },
    lookupsChange: true,
  },
  manufacturers: {
    title: 'Manufacturers', single: 'manufacturer', group: 'Catalog',
    list: [C('picture', 'Picture', 'image'), C('name', 'Name'), C('products', 'Products', 'number'), C('published', 'Published', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Manufacturer info', fields: [F('name', 'Name', 'text', { required: true }), F('description', 'Description', 'html'), F('picture', 'Picture', 'image'), F('published', 'Published', 'bool'), F('display_order', 'Display order', 'int'), F('slug', 'Search engine friendly page name')] }],
    defaults: { published: true, display_order: 0 }, lookupsChange: true,
  },
  reviews: {
    title: 'Product reviews', single: 'product review', group: 'Catalog', noCreate: true,
    filters: [F('approved', 'Approved', 'select', { options: BOOL_FILTER })],
    list: [C('product_name', 'Product'), C('customer_email', 'Customer'), C('title', 'Title'), C('body', 'Review text', 'truncate'), C('rating', 'Rating', 'number'), C('approved', 'Approved', 'bool'), C('created_at', 'Created on', 'datetime')],
    bulk: [{ key: 'approve', label: 'Approve selected', values: { approved: true } }, { key: 'disapprove', label: 'Disapprove selected', values: { approved: false } }],
    sections: [{ title: 'Review', fields: [F('product_name', 'Product', 'info', { link: (r) => `/admin/products/edit/${r.product_id}` }), F('customer_email', 'Customer', 'info'), F('created_at', 'Created on', 'info', { format: 'datetime' }),
      F('title', 'Title', 'text', { required: true }), F('body', 'Review text', 'textarea'), F('rating', 'Rating', 'select', { options: [1, 2, 3, 4, 5].map((n) => [n, `${n} star${n > 1 ? 's' : ''}`]), int: true }),
      F('reply_text', 'Reply text', 'textarea'), F('approved', 'Is approved', 'bool')] }],
  },
  product_tags: {
    title: 'Product tags', single: 'product tag', group: 'Catalog',
    list: [C('name', 'Tag name'), C('products', 'Tagged products', 'number')],
    sections: [{ title: 'Tag', fields: [F('name', 'Name', 'text', { required: true })] }],
  },
  product_attributes: {
    title: 'Product attributes', single: 'product attribute', group: 'Catalog',
    list: [C('name', 'Name'), C('description', 'Description', 'truncate'), C('used_by', 'Used by products', 'number')],
    sections: [{ title: 'Attribute info', fields: [F('name', 'Name', 'text', { required: true }), F('description', 'Description', 'textarea')] }],
    lookupsChange: true,
  },
  spec_attributes: {
    title: 'Specification attributes', single: 'specification attribute', group: 'Catalog',
    list: [C('name', 'Name'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Attribute info', fields: [F('name', 'Name', 'text', { required: true }), F('display_order', 'Display order', 'int')] }],
    children: { key: 'options', title: 'Options', single: 'option', cols: [F('name', 'Name'), F('color_rgb', 'Color (RGB)', 'color'), F('display_order', 'Display order', 'int')] },
    defaults: { display_order: 0 }, lookupsChange: true,
  },
  checkout_attributes: {
    title: 'Checkout attributes', single: 'checkout attribute', group: 'Catalog',
    list: [C('name', 'Name'), C('control_type', 'Control type', 'badge'), C('is_required', 'Required', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Attribute info', fields: [F('name', 'Name', 'text', { required: true }), F('text_prompt', 'Text prompt'), F('is_required', 'Required', 'bool'), F('shippable_only', 'Shippable product required', 'bool'),
      F('control_type', 'Control type', 'select', { options: CONTROL_TYPES }), F('display_order', 'Display order', 'int')] }],
    children: { key: 'values', title: 'Attribute values', single: 'value', cols: [F('name', 'Name'), F('price_adjustment', 'Price adjustment', 'money'), F('is_preselected', 'Pre-selected', 'bool'), F('display_order', 'Display order', 'int')] },
    defaults: { control_type: 'dropdown', display_order: 0 },
  },
  return_requests: {
    title: 'Return requests', single: 'return request', group: 'Sales', noCreate: true,
    filters: [F('status', 'Return status', 'select', { options: [['', 'All'], ...RETURN_STATUSES.map((s) => [s, s.replace(/([a-z])([A-Z])/g, '$1 $2')])] })],
    list: [C('custom_number', 'ID'), C('product_name', 'Product'), C('quantity', 'Quantity', 'number'), C('customer_email', 'Customer'), C('order_id', 'Order', 'link', { to: (r) => `/admin/orders/edit/${r.order_id}`, text: (r) => `#${r.order_id}` }), C('status', 'Status', 'badge'), C('created_at', 'Date', 'datetime')],
    sections: [{ title: 'Return request', fields: [F('custom_number', 'ID', 'info'), F('order_id', 'Order', 'info', { link: (r) => `/admin/orders/edit/${r.order_id}` }), F('customer_email', 'Customer', 'info'), F('product_name', 'Product', 'info'),
      F('quantity', 'Quantity', 'int'), F('returned_qty', 'Quantity returned to stock', 'int'), F('reason', 'Return reason'), F('requested_action', 'Return action'), F('comments', 'Customer comments', 'textarea'), F('staff_notes', 'Staff notes', 'textarea'),
      F('status', 'Return request status', 'select', { options: RETURN_STATUSES.map((s) => [s, s.replace(/([a-z])([A-Z])/g, '$1 $2')]) }), F('created_at', 'Date', 'info', { format: 'datetime' })] }],
  },
  gift_cards: {
    title: 'Gift cards', single: 'gift card', group: 'Sales',
    filters: [F('is_activated', 'Activated', 'select', { options: BOOL_FILTER })],
    list: [C('code', 'Coupon code'), C('gift_card_type', 'Type', 'badge'), C('amount', 'Initial value', 'money'), C('remaining', 'Remaining amount', 'money'), C('is_activated', 'Is activated', 'bool'), C('recipient_name', 'Recipient'), C('created_at', 'Created on', 'datetime')],
    sections: [{ title: 'Gift card info', fields: [F('gift_card_type', 'Gift card type', 'select', { options: [['virtual', 'Virtual'], ['physical', 'Physical']] }), F('order_id', 'Order', 'info', { link: (r) => r.order_id && `/admin/orders/edit/${r.order_id}`, hideEmpty: true }),
      F('amount', 'Initial value', 'money'), F('remaining', 'Remaining amount', 'info', { format: 'money', hideEmpty: true }), F('is_activated', 'Is gift card activated', 'bool'), F('code', 'Coupon code', 'giftcode'),
      F('recipient_name', 'Recipient name'), F('recipient_email', 'Recipient email', 'email'), F('sender_name', 'Sender name'), F('sender_email', 'Sender email', 'email'), F('message', 'Message', 'textarea')] }],
    defaults: { gift_card_type: 'virtual', amount: 0, is_activated: true },
  },
  customer_roles: {
    title: 'Customer roles', single: 'customer role', group: 'Customers',
    list: [C('name', 'Name'), C('system_name', 'System name'), C('free_shipping', 'Free shipping', 'bool'), C('tax_exempt', 'Tax exempt', 'bool'), C('is_system', 'Is system role', 'bool'), C('active', 'Active', 'bool')],
    sections: [{ title: 'Role info', fields: [F('name', 'Name', 'text', { required: true }), F('system_name', 'System name'), F('active', 'Active', 'bool'), F('free_shipping', 'Free shipping', 'bool'), F('tax_exempt', 'Tax exempt', 'bool')] }],
    defaults: { active: true }, lookupsChange: true,
  },
  activity_log: {
    title: 'Activity log', single: 'activity log entry', group: 'Customers', noCreate: true, readOnly: true, clearable: true,
    filters: [F('type', 'Activity log type', 'text', { placeholder: 'e.g. EditProduct' })],
    list: [C('type', 'Activity log type', 'badge'), C('customer_email', 'Customer'), C('comment', 'Message', 'truncate'), C('ip', 'IP address'), C('created_at', 'Created on', 'datetime')],
  },
  discounts: {
    title: 'Discounts', single: 'discount', group: 'Promotions',
    filters: [F('discount_type', 'Discount type', 'select', { options: [['', 'All'], ...DISCOUNT_TYPES] })],
    list: [C('name', 'Name'), C('discount_type', 'Discount type', 'enum', { options: DISCOUNT_TYPES }), C('value', 'Discount', 'text', { get: (r) => (r.use_percentage ? `${r.percentage}%` : `$${Number(r.amount || 0).toFixed(2)}`) }), C('coupon_code', 'Coupon code'),
      C('times_used', 'Times used', 'number'), C('start_at', 'Start date', 'date'), C('end_at', 'End date', 'date'), C('active', 'Active', 'bool')],
    sections: [
      { title: 'Discount info', fields: [F('name', 'Name', 'text', { required: true }), F('active', 'Is active', 'bool'), F('discount_type', 'Discount type', 'select', { options: DISCOUNT_TYPES }),
        F('apply_to_subcategories', 'Apply to subcategories', 'bool', { show: (r) => r.discount_type === 'categories' }),
        F('use_percentage', 'Use percentage', 'bool'), F('percentage', 'Discount percentage', 'number', { show: (r) => r.use_percentage }), F('max_amount', 'Maximum discount amount', 'money', { show: (r) => r.use_percentage }),
        F('amount', 'Discount amount', 'money', { show: (r) => !r.use_percentage }), F('max_qty', 'Maximum discounted quantity', 'int', { show: (r) => ['products', 'categories', 'manufacturers'].includes(r.discount_type) }),
        F('is_cumulative', 'Cumulative with other discounts', 'bool'), F('requires_coupon', 'Requires coupon code', 'bool'), F('coupon_code', 'Coupon code', 'text', { show: (r) => r.requires_coupon }),
        F('start_at', 'Start date', 'datetime'), F('end_at', 'End date', 'datetime'),
        F('limitation', 'Discount limitation', 'select', { options: LIMITATIONS }), F('limitation_times', 'N times', 'int', { show: (r) => r.limitation && r.limitation !== 'unlimited' }),
        F('admin_comment', 'Admin comment', 'textarea')] },
      { title: 'Requirements', fields: [F('min_subtotal', 'Minimum order subtotal', 'money'), F('required_role_id', 'Must be assigned to customer role', 'select', { options: (lk) => [['', '[None]'], ...(lk.roles || []).map((r) => [r.id, r.name])], int: true })] },
    ],
    maps: [
      { key: 'productIds', label: 'Applied to products', source: 'products', show: (r) => r.discount_type === 'products' },
      { key: 'categoryIds', label: 'Applied to categories', source: 'categoryOptions', show: (r) => r.discount_type === 'categories' },
      { key: 'manufacturerIds', label: 'Applied to manufacturers', source: 'manufacturers', show: (r) => r.discount_type === 'manufacturers' },
    ],
    defaults: { discount_type: 'order_subtotal', use_percentage: true, percentage: 10, limitation: 'unlimited', limitation_times: 1, active: true, apply_to_subcategories: true, productIds: [], categoryIds: [], manufacturerIds: [] },
  },
  newsletter: {
    title: 'Newsletter subscribers', single: 'subscriber', group: 'Promotions',
    filters: [F('active', 'Active', 'select', { options: BOOL_FILTER })],
    list: [C('email', 'Email'), C('active', 'Active', 'bool'), C('created_at', 'Subscribed on', 'datetime')],
    bulk: [{ key: 'activate', label: 'Activate selected', values: { active: true } }, { key: 'deactivate', label: 'Deactivate selected', values: { active: false } }],
    sections: [{ title: 'Subscription', fields: [F('email', 'Email', 'email', { required: true }), F('active', 'Active', 'bool')] }],
    defaults: { active: true },
  },
  campaigns: {
    title: 'Campaigns', single: 'campaign', group: 'Promotions',
    list: [C('name', 'Name'), C('subject', 'Subject'), C('sent_count', 'Sent emails', 'number'), C('sent_at', 'Last sent', 'datetime'), C('created_at', 'Created on', 'datetime')],
    sections: [{ title: 'Campaign info', fields: [F('name', 'Name', 'text', { required: true }), F('subject', 'Subject'), F('body', 'Body', 'html', { hint: 'Tokens: %Store.Name%, %Store.URL%, %Store.Email%' })] }],
    extra: 'campaign',
  },
  topics: {
    title: 'Topics (pages)', single: 'topic', group: 'Content management',
    list: [C('system_name', 'System name'), C('title', 'Title'), C('include_in_top_menu', 'Top menu', 'bool'), C('footer_column', 'Footer column', 'number'), C('published', 'Published', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Topic info', fields: [F('title', 'Title', 'text', { required: true }), F('system_name', 'System name'), F('body', 'Body', 'html', { rows: 14 }),
      F('published', 'Published', 'bool'), F('include_in_top_menu', 'Include in top menu', 'bool'), F('footer_column', 'Include in footer column', 'select', { options: [[0, 'None'], [1, 'Column 1'], [2, 'Column 2'], [3, 'Column 3']], int: true }),
      F('display_order', 'Display order', 'int'), F('slug', 'Search engine friendly page name')] }],
    defaults: { published: true, display_order: 0, footer_column: 0 }, preview: (r) => r.slug && `/page/${r.slug}`,
  },
  message_templates: {
    title: 'Message templates', single: 'message template', group: 'Content management', noCreate: false,
    list: [C('name', 'Name'), C('subject', 'Subject'), C('active', 'Is active', 'bool')],
    sections: [{ title: 'Template', fields: [F('name', 'Name', 'text', { required: true }), F('subject', 'Subject'), F('body', 'Body', 'html', { rows: 14, hint: 'Tokens use %Name% syntax, e.g. %Store.Name%, %Order.OrderNumber%, %Customer.FullName%' }), F('active', 'Is active', 'bool')] }],
    defaults: { active: true },
  },
  news: {
    title: 'News items', single: 'news item', group: 'Content management',
    list: [C('title', 'Title'), C('comments', 'Comments', 'number'), C('start_at', 'Start date', 'date'), C('end_at', 'End date', 'date'), C('published', 'Published', 'bool'), C('created_at', 'Created on', 'datetime')],
    sections: [{ title: 'News item', fields: [F('title', 'Title', 'text', { required: true }), F('short', 'Short description', 'textarea'), F('full_text', 'Full description', 'html', { rows: 12 }),
      F('allow_comments', 'Allow comments', 'bool'), F('start_at', 'Start date', 'datetime'), F('end_at', 'End date', 'datetime'), F('published', 'Published', 'bool'), F('slug', 'Search engine friendly page name')] }],
    defaults: { published: true, allow_comments: true }, preview: (r) => r.slug && `/news/${r.slug}`,
  },
  news_comments: {
    title: 'News comments', single: 'news comment', group: 'Content management', noCreate: true,
    filters: [F('approved', 'Approved', 'select', { options: BOOL_FILTER })],
    list: [C('news_title', 'News item'), C('customer_email', 'Customer'), C('title', 'Title'), C('body', 'Comment', 'truncate'), C('approved', 'Approved', 'bool'), C('created_at', 'Created on', 'datetime')],
    bulk: [{ key: 'approve', label: 'Approve selected', values: { approved: true } }, { key: 'disapprove', label: 'Disapprove selected', values: { approved: false } }],
    sections: [{ title: 'Comment', fields: [F('news_title', 'News item', 'info'), F('customer_email', 'Customer', 'info'), F('title', 'Title'), F('body', 'Comment', 'textarea'), F('approved', 'Is approved', 'bool')] }],
  },
  blog: {
    title: 'Blog posts', single: 'blog post', group: 'Content management',
    list: [C('title', 'Title'), C('tags', 'Tags'), C('comments', 'Comments', 'number'), C('published', 'Published', 'bool'), C('created_at', 'Created on', 'datetime')],
    sections: [{ title: 'Blog post', fields: [F('title', 'Title', 'text', { required: true }), F('overview', 'Overview', 'textarea'), F('body', 'Body', 'html', { rows: 14 }), F('tags', 'Tags', 'text', { hint: 'Comma separated' }),
      F('allow_comments', 'Allow comments', 'bool'), F('published', 'Published', 'bool'), F('created_at', 'Created on', 'datetime'), F('slug', 'Search engine friendly page name')] }],
    defaults: { published: true, allow_comments: true }, preview: (r) => r.slug && `/blog/${r.slug}`,
  },
  blog_comments: {
    title: 'Blog comments', single: 'blog comment', group: 'Content management', noCreate: true,
    filters: [F('approved', 'Approved', 'select', { options: BOOL_FILTER })],
    list: [C('post_title', 'Blog post'), C('customer_email', 'Customer'), C('body', 'Comment', 'truncate'), C('approved', 'Approved', 'bool'), C('created_at', 'Created on', 'datetime')],
    bulk: [{ key: 'approve', label: 'Approve selected', values: { approved: true } }, { key: 'disapprove', label: 'Disapprove selected', values: { approved: false } }],
    sections: [{ title: 'Comment', fields: [F('post_title', 'Blog post', 'info'), F('customer_email', 'Customer', 'info'), F('body', 'Comment', 'textarea'), F('approved', 'Is approved', 'bool')] }],
  },
  polls: {
    title: 'Polls', single: 'poll', group: 'Content management',
    list: [C('name', 'Name'), C('system_keyword', 'System keyword'), C('published', 'Published', 'bool'), C('show_on_home', 'Show on home', 'bool'), C('start_at', 'Start date', 'date'), C('end_at', 'End date', 'date'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Poll info', fields: [F('name', 'Question', 'text', { required: true }), F('system_keyword', 'System keyword'), F('published', 'Published', 'bool'), F('show_on_home', 'Show on home page', 'bool'),
      F('allow_guests', 'Allow guests to vote', 'bool'), F('display_order', 'Display order', 'int'), F('start_at', 'Start date', 'datetime'), F('end_at', 'End date', 'datetime')] }],
    children: { key: 'answers', title: 'Poll answers', single: 'answer', cols: [F('name', 'Name'), F('votes', 'Votes', 'int'), F('display_order', 'Display order', 'int')] },
    defaults: { published: true, show_on_home: true, display_order: 0 },
  },
  shipping_methods: {
    title: 'Shipping methods', single: 'shipping method', group: 'Configuration',
    list: [C('name', 'Name'), C('description', 'Description', 'truncate'), C('rate', 'Rate', 'money'), C('rate_per_kg', 'Rate per kg', 'money'), C('active', 'Active', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Shipping method', fields: [F('name', 'Name', 'text', { required: true }), F('description', 'Description', 'textarea'), F('rate', 'Fixed rate', 'money'), F('rate_per_kg', 'Rate per kg', 'money'), F('display_order', 'Display order', 'int'), F('active', 'Active', 'bool')] }],
    defaults: { active: true, rate: 0, rate_per_kg: 0, display_order: 0 },
  },
  pickup_points: {
    title: 'Pickup points', single: 'pickup point', group: 'Configuration',
    list: [C('name', 'Name'), C('address', 'Address'), C('city', 'City'), C('fee', 'Pickup fee', 'money'), C('active', 'Active', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Pickup point', fields: [F('name', 'Name', 'text', { required: true }), F('description', 'Description', 'textarea'), F('address', 'Address'), F('city', 'City'), F('country', 'Country'),
      F('opening_hours', 'Opening hours'), F('fee', 'Pickup fee', 'money'), F('display_order', 'Display order', 'int'), F('active', 'Active', 'bool')] }],
    defaults: { active: true, fee: 0, display_order: 0 },
  },
  payment_methods: {
    title: 'Payment methods', single: 'payment method', group: 'Configuration', noCreate: true, noDelete: true, pk: 'system_name',
    list: [C('name', 'Friendly name'), C('system_name', 'System name'), C('additional_fee', 'Additional fee', 'number'), C('fee_percentage', 'Fee is %', 'bool'), C('active', 'Is active', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Payment method', fields: [F('system_name', 'System name', 'info'), F('name', 'Friendly name', 'text', { required: true }), F('description', 'Description', 'textarea'), F('additional_fee', 'Additional fee', 'number'),
      F('fee_percentage', 'Additional fee. Use percentage', 'bool'), F('display_order', 'Display order', 'int'), F('active', 'Is active', 'bool')] }],
  },
  tax_categories: {
    title: 'Tax categories', single: 'tax category', group: 'Configuration',
    list: [C('name', 'Name'), C('rate', 'Rate (%)', 'number'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Tax category', fields: [F('name', 'Name', 'text', { required: true }), F('rate', 'Tax rate (%)', 'number'), F('display_order', 'Display order', 'int')] }],
    defaults: { rate: 0, display_order: 0 }, lookupsChange: true,
  },
  countries: {
    title: 'Countries', single: 'country', group: 'Configuration',
    list: [C('name', 'Name'), C('code', 'ISO code'), C('allows_billing', 'Allows billing', 'bool'), C('allows_shipping', 'Allows shipping', 'bool'), C('published', 'Published', 'bool'), C('display_order', 'Display order', 'number')],
    bulk: [{ key: 'publish', label: 'Publish selected', values: { published: true } }, { key: 'unpublish', label: 'Unpublish selected', values: { published: false } }],
    sections: [{ title: 'Country info', fields: [F('name', 'Name', 'text', { required: true }), F('code', 'ISO code'), F('allows_billing', 'Allow billing', 'bool'), F('allows_shipping', 'Allow shipping', 'bool'), F('published', 'Published', 'bool'), F('display_order', 'Display order', 'int')] }],
    children: { key: 'states', title: 'States / provinces', single: 'state', cols: [F('name', 'Name'), F('abbreviation', 'Abbreviation'), F('display_order', 'Display order', 'int')] },
    defaults: { allows_billing: true, allows_shipping: true, published: true, display_order: 0 }, lookupsChange: true,
  },
  currencies: {
    title: 'Currencies', single: 'currency', group: 'Configuration',
    list: [C('name', 'Name'), C('code', 'Currency code'), C('symbol', 'Symbol'), C('rate', 'Exchange rate', 'number'), C('is_primary', 'Primary', 'bool'), C('published', 'Published', 'bool'), C('display_order', 'Display order', 'number')],
    sections: [{ title: 'Currency info', fields: [F('name', 'Name', 'text', { required: true }), F('code', 'Currency code'), F('symbol', 'Symbol'), F('rate', 'Exchange rate', 'number'), F('custom_format', 'Custom formatting', 'text', { hint: 'e.g. C2 or {0} ₫' }),
      F('is_primary', 'Primary store currency', 'bool'), F('published', 'Published', 'bool'), F('display_order', 'Display order', 'int')] }],
    defaults: { rate: 1, published: true, display_order: 0 },
  },
  queued_emails: {
    title: 'Queued emails', single: 'queued email', group: 'System', noCreate: true, clearable: true,
    list: [C('id', 'ID', 'number'), C('to_email', 'To'), C('subject', 'Subject', 'truncate'), C('priority', 'Priority', 'badge'), C('created_at', 'Created on', 'datetime'), C('sent_tries', 'Sent attempts', 'number'), C('sent_at', 'Sent on', 'datetime')],
    sections: [{ title: 'Email', fields: [F('from_email', 'From', 'info'), F('to_email', 'To', 'email'), F('to_name', 'To name'), F('subject', 'Subject'), F('priority', 'Priority', 'select', { options: ['High', 'Low'] }),
      F('created_at', 'Created on', 'info', { format: 'datetime' }), F('sent_tries', 'Sent attempts', 'info'), F('sent_at', 'Sent on', 'datetime'), F('body', 'Body', 'html', { rows: 10 })] }],
    extra: 'queuedEmail',
  },
  system_log: {
    title: 'Log', single: 'log entry', group: 'System', noCreate: true, clearable: true,
    filters: [F('level', 'Log level', 'select', { options: [['', 'All'], ...LOG_LEVELS] })],
    list: [C('level', 'Log level', 'badge'), C('short_message', 'Short message', 'truncate'), C('page_url', 'Page URL'), C('created_at', 'Created on', 'datetime')],
    sections: [{ title: 'Log entry', readOnly: true, fields: [F('level', 'Log level', 'info'), F('short_message', 'Short message', 'info'), F('page_url', 'Page URL', 'info'), F('customer_id', 'Customer', 'info', { link: (r) => r.customer_id && `/admin/customers/edit/${r.customer_id}` }),
      F('created_at', 'Created on', 'info', { format: 'datetime' }), F('full_message', 'Full message', 'info', { format: 'pre' })] }],
    viewOnly: true,
  },
  search_terms: {
    title: 'Search terms', single: 'search term', group: 'System', noCreate: true, readOnly: true, clearable: true, pk: 'term',
    list: [C('term', 'Keyword'), C('count', 'Count', 'number'), C('updated_at', 'Last searched', 'datetime')],
  },
  back_in_stock: {
    title: 'Back in stock subscriptions', single: 'subscription', group: 'System', noCreate: true, readOnly: true,
    list: [C('product_name', 'Product', 'link', { to: (r) => `/admin/products/edit/${r.product_id}` }), C('customer_email', 'Customer', 'link', { to: (r) => `/admin/customers/edit/${r.customer_id}` }), C('created_at', 'Subscribed on', 'datetime')],
  },
  shipments: {
    title: 'Shipments', single: 'shipment', group: 'Sales', noCreate: true, noDelete: true,
    list: [C('id', 'Shipment #', 'number'), C('custom_number', 'Order #', 'link', { to: (r) => `/admin/orders/edit/${r.order_id}`, text: (r) => r.custom_number || r.order_id }), C('customer_email', 'Customer'),
      C('tracking_number', 'Tracking number'), C('items', 'Items', 'number'), C('total_weight', 'Total weight', 'number'), C('shipped_at', 'Date shipped', 'datetime'), C('delivered_at', 'Date delivered', 'datetime')],
  },
}

// URL slug <-> entity key
export const slugOf = (key) => key.replace(/_/g, '-')
export const keyOf = (slug) => slug.replace(/-/g, '_')
