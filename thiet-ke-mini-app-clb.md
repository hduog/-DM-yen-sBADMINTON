# Tài liệu thiết kế: Telegram Mini App quản lý CLB thể thao (điểm danh – chi phí – sao kê)

## 0. Tóm tắt

Ứng dụng giúp trưởng nhóm/ban cán sự của một hội nhóm thể thao (cầu lông, bóng đá...) tự động hoá 3 việc đang làm thủ công bằng chat:

1. Điểm danh trước buổi tập, chốt đủ/thiếu người, hỗ trợ tuyển vãng lai khi thiếu.
2. Tính chi phí phát sinh mỗi buổi (tiền cầu, tiền nước...) và chia cho người có mặt.
3. Tổng hợp sao kê cuối tháng cho từng thành viên, theo dõi và duyệt thanh toán.

**Stack:** Next.js (FE+BE chung 1 app) → deploy Vercel (free) · MongoDB Atlas (free M0) · Telegram Bot API + Telegram Mini App (WebApp) — toàn bộ **miễn phí**.

**Kết luận khả thi:** Khả thi tốt cho quy mô 1 CLB (vài chục thành viên). Có 3 giới hạn kỹ thuật của nền tảng free cần thiết kế workaround ngay từ đầu — xem mục 1.

---

## 1. Các điểm cần lưu ý về tính khả thi (đọc trước khi code)

### 1.1. Vercel Hobby (free) giới hạn Cron Job
- Cron job trên gói Hobby **chỉ được chạy tối đa 1 lần/ngày**, và thời điểm chạy **không chính xác** (có thể trễ trong vòng 1 tiếng so với giờ đặt).
- Bài toán cần trigger **3–5 lần/ngày** với giờ giấc cụ thể (gửi poll, chốt điểm danh, nhắc chi phí, chốt sao kê...) → cron built-in của Vercel **không đáp ứng được**.
- **Giải pháp: dùng `cron-job.org` (miễn phí hoàn toàn)** — dịch vụ này cho phép tạo **không giới hạn số lượng job**, chạy tới **60 lần/giờ**, có REST API để quản lý job tự động. Nhu cầu 3-5 lần/ngày nằm gọn trong hạn mức free.
  - **Cách A (đơn giản):** Tạo trực tiếp 3-5 job cố định trên cron-job.org, mỗi job gọi đúng 1 API endpoint tương ứng 1 hành động (VD: `/api/cron/send-poll`, `/api/cron/check-attendance`, `/api/cron/cost-reminder`, `/api/cron/monthly-settlement`), đặt sẵn giờ/ngày trong tuần theo lịch tập. Khi đổi lịch, vào cron-job.org sửa giờ trực tiếp.
  - **Cách B (linh hoạt hơn, khuyến nghị):** Vẫn để cron-job.org gọi **một API route duy nhất** `/api/cron/tick` mỗi 15–30 phút (vẫn miễn phí). Route không hard-code giờ, mà **tự đọc lịch trình đã lưu trong MongoDB** (giờ tập, giờ nhắc, ngày chốt sao kê...) và kiểm tra "bây giờ có việc gì cần chạy không" rồi thực thi. Ưu điểm: khi admin đổi giờ tập ngay trong Mini App, hệ thống áp dụng luôn mà không cần sửa gì ở cron-job.org.
  - **Dự phòng (tuỳ chọn):** đặt thêm 1 job y hệt trên GitHub Actions (scheduled workflow, free) hoặc UptimeRobot (free, gọi URL theo chu kỳ 5 phút) trỏ cùng route, để tăng độ tin cậy nếu cron-job.org gặp sự cố — vẫn 0đ.
- Cần có cơ chế xác thực đơn giản (secret token trong header) để chỉ dịch vụ cron ngoài mới gọi được route này.

### 1.2. Facebook — chỉ generate nội dung, không auto-post (đã xác nhận)
- App **chỉ sinh nội dung bài đăng** từ template do quản trị cung cấp (điền ngày, số lượng cần tuyển vãng lai vào chỗ trống) → trả về text hoàn chỉnh → admin bấm **Copy** → tự đăng thủ công vào các hội nhóm Facebook. Không có bước tự động đăng bài (Facebook Graph API cũng không cho phép app bên thứ 3 tự đăng vào group của người khác, nên hướng này vừa đúng kỹ thuật vừa đơn giản).
- App hỗ trợ thêm: lưu sẵn danh sách link các hội nhóm Facebook hay tuyển, hiện nút "Copy nội dung", hiện nút mở nhanh từng link group để dán bài cho nhanh.

### 1.3. Sao kê riêng từng thành viên — dùng group riêng thay vì DM (đã xác nhận)
- **Quyết định thiết kế:** thay vì DM (vốn yêu cầu member phải `/start` bot trước), dùng **1 group riêng cho mỗi thành viên**, gồm: các quản trị (VD: C, D) + đúng 1 thành viên đó (VD: anh A).
- **Phạm vi sử dụng của group này — chỉ 2 việc:** (1) gửi sao kê cuối tháng của đúng người đó, và (2) nhận xác nhận thanh toán từ người đó. **Không** dùng group này cho điểm danh hay các thông báo chung khác — những việc đó vẫn diễn ra ở group chính và group Ban quản trị (xem cấu trúc đầy đủ 3 loại nhóm ở mục 3).
- **Vì sao đáng tin cậy hơn DM:** group không có ràng buộc "user phải chủ động nhắn trước" như DM — chỉ cần bot là thành viên của group là gửi tin thoải mái, không phụ thuộc việc member có `/start` bot hay không.
- **Giới hạn kỹ thuật cần biết:** Telegram Bot API **không có API để bot tự tạo group** — việc tạo group phải do **con người thao tác thủ công** trên Telegram (1 admin tạo group, add bot + các quản trị + thành viên đó vào). Đây là bước **one-time setup khi có thành viên mới**, không lặp lại hàng tháng.
- Sau khi tạo group xong, admin chỉ cần **lấy `chat_id` của group đó** (bot có thể trả về chat_id khi có tin nhắn/hành động đầu tiên trong group, hoặc dùng lệnh `/getid` tự tạo trong bot) và lưu vào field `statement_chat_id` của member trong DB. Từ đó mọi thông báo/sao kê gửi tự động vào đúng group.
- **Quy mô:** với CLB vài chục thành viên, tạo N group thủ công 1 lần là hoàn toàn ổn. Bot không giới hạn tổng số nhóm được tham gia (chỉ giới hạn tốc độ gia nhập ~20 nhóm/phút để chống spam), nên không đáng lo ở quy mô này.

### 1.4. Webhook thay vì Long-polling
- Vì chạy trên serverless (Vercel), bot **phải dùng chế độ Webhook** (Telegram gọi vào API route của bạn mỗi khi có tin nhắn/poll trả lời), không dùng long-polling (vì function không chạy liên tục).
- Cấu hình 1 lần bằng `setWebhook` trỏ về `https://your-app.vercel.app/api/telegram/webhook`.

### 1.5. Poll điểm danh phải là poll "không ẩn danh"
- Telegram poll thường ở chế độ ẩn danh (không biết ai chọn gì) — nếu ẩn danh thì **app không lấy được danh sách ai có mặt/vắng mặt**.
- Phải tạo poll với `is_anonymous: false` để bot nhận được sự kiện `poll_answer` (chứa `user.id` + lựa chọn), từ đó ghi vào DB.

**Đánh giá tổng thể:** Không có rào cản nào là "không làm được" — chỉ là cần thiết kế đúng ngay từ đầu (cron ngoài, poll non-anonymous, generate nội dung thay vì auto-post FB, onboarding `/start` bot). Với quy mô 1 CLB, chi phí vận hành = 0đ.

---

## 2. Kiến trúc tổng quan

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   Telegram (Group chat,  │◄──────►│   Next.js App (Vercel)        │
│   Bot, Mini App WebView) │ Webhook│   - API routes (BE)           │
└─────────────────────────┘        │   - Mini App UI (FE, admin)   │
                                    └───────────┬────────────────────┘
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          ▼                                           ▼
                 ┌──────────────────┐                     ┌──────────────────────┐
                 │  MongoDB Atlas    │                     │  External Cron        │
                 │  (free M0)        │◄────────────────────│  (cron-job.org, gọi   │
                 │  - sessions       │      polling ghi     │  /api/cron/tick mỗi   │
                 │  - attendance     │      trạng thái       │  1-5 phút)            │
                 │  - payments...    │                      └──────────────────────┘
                 └──────────────────┘
```

**Thành phần chính:**
- **Telegram Bot**: gửi poll điểm danh, thông báo, nhận `poll_answer`/`callback_query`/`message` qua webhook.
- **Telegram Mini App**: giao diện web nhúng trong Telegram, chỉ **admin/ban cán sự** mở được (xác thực qua Telegram `initData`), dùng để: xem trạng thái điểm danh, nhập số lượng vật phẩm, tạo bài tuyển vãng lai, xem/duyệt sao kê thanh toán, cấu hình lịch trình & giá vật phẩm.
- **Next.js API routes**: vừa là webhook handler cho Telegram, vừa là backend cho Mini App (CRUD), vừa là endpoint cho cron ngoài gọi vào.
- **MongoDB Atlas**: lưu toàn bộ dữ liệu.
- **Thành viên thường**: không đăng nhập app, chỉ tương tác qua Telegram (trả lời poll, bấm inline button, nhận thông báo).

---

## 3. Cấu trúc nhóm Telegram & phân quyền

Hệ thống dùng **3 loại nhóm Telegram** khác nhau, mỗi loại phục vụ đúng 1 mục đích — tránh dồn hết thông báo vào một chỗ gây loãng thông tin:

| Nhóm | Thành viên trong nhóm | Nhận thông báo gì |
|---|---|---|
| **① Group chính** (toàn CLB) | Tất cả thành viên + admin | • Poll điểm danh trước buổi tập<br>• Thông báo xác nhận **đủ người** cho buổi tập<br>• Thông báo thành viên đã thanh toán xong tháng (minh bạch chung)<br>• Các thông báo chung khác của CLB |
| **② Group Ban quản trị** (chỉ admin) | Các quản trị viên (VD: C, D...) | • Trạng thái điểm danh theo thời gian thực / khi **thiếu người** (kèm nút tạo bài tuyển vãng lai)<br>• Nhắc nhập số lượng vật phẩm sau buổi tập + kết quả chi phí đã tính<br>• Bản tổng hợp sao kê toàn CLB cuối tháng<br>• Danh sách thành viên vừa báo "đã thanh toán" đang chờ duyệt |
| **③ Group riêng từng thành viên** (admin + đúng 1 member) | Admin + 1 thành viên | **Chỉ 2 việc:** gửi sao kê cá nhân cuối tháng của người đó, và nhận xác nhận thanh toán riêng (member bấm "Tôi đã thanh toán" trong group này) |

- **Group ① và ②** chỉ cần tạo **1 lần duy nhất** cho cả CLB — lưu `chat_id` vào `settings.main_group_chat_id` và `settings.admin_group_chat_id`.
- **Group ③** cần tạo **1 lần cho mỗi thành viên** khi họ gia nhập CLB (chi tiết & giới hạn kỹ thuật xem mục 1.3).

### Vai trò & quyền truy cập app

| Vai trò | Cách truy cập | Quyền |
|---|---|---|
| **Admin / ban quản trị** | Mở Telegram Mini App, xác thực qua Telegram `initData` (chỉ `telegram_id` nằm trong whitelist DB mới vào được) | Toàn quyền: cấu hình lịch, điểm danh, nhập chi phí, tạo bài tuyển, xem & duyệt sao kê |
| **Thành viên** | Không login vào app | Trả lời poll điểm danh (nhóm ①), nhận sao kê & bấm "Tôi đã thanh toán" (nhóm ③) |

Xác thực admin: dùng `window.Telegram.WebApp.initData` phía FE gửi lên BE, BE verify bằng HMAC-SHA256 với bot token theo chuẩn Telegram (đây là cách xác thực chính thức, không cần thêm mật khẩu/OTP).

---

## 4. Data model (MongoDB collections)

```
members
  _id, telegram_id, full_name, username, role (admin|member),
  status (active|inactive), statement_chat_id, joined_at
  // statement_chat_id: id của group riêng (quản trị + member này) dùng để gửi sao kê

sessions                  // 1 buổi tập
  _id, date, start_time, end_time, min_required,
  status (scheduled|confirmed_enough|confirmed_shortage|cancelled),
  poll_message_id, need_recruit (bool), recruit_count_needed

attendance                // kết quả điểm danh 1 buổi
  _id, session_id, member_id, answer (present|absent|no_response), answered_at

item_configs               // danh mục vật phẩm & đơn giá (setting trước)
  _id, name (VD: "trái cầu", "chai nước"), unit_price, unit

session_costs               // chi phí phát sinh 1 buổi
  _id, session_id, item_id, quantity, total_amount

monthly_statements          // sao kê theo tháng theo từng member
  _id, member_id, month (YYYY-MM), total_sessions,
  total_amount, status (pending|paid_reported|approved), 
  paid_reported_at, approved_at, approved_by

recruit_templates            // template bài tuyển vãng lai
  _id, name, content_template   // có placeholder {date} {time} {quantity} {location}

fb_group_links                // danh sách group FB hay đăng tuyển
  _id, name, url

settings                     // cấu hình chung
  _id, main_group_chat_id, admin_group_chat_id,       // chat_id nhóm ① và ②
  weekly_schedule ([{weekday, start_time, end_time}]),
  reminder_hours_before, cost_survey_minutes_after,
  monthly_settlement_day, club_name
```

---

## 5. Luồng nghiệp vụ chi tiết

### 5.1. Điểm danh trước buổi tập
1. Cron ngoài gọi `/api/cron/tick` liên tục, route đọc `settings.weekly_schedule` để biết sắp tới có buổi tập nào.
2. Đến mốc "trước giờ tập N tiếng" (VD: 1 ngày trước) → bot gửi **poll non-anonymous** vào **nhóm ① (chính)**: *"Bạn có tham gia buổi tập [ngày giờ] không?"* (Có/Không).
3. Thành viên trả lời → Telegram gửi event `poll_answer` về webhook → ghi vào collection `attendance`.
4. Đến mốc **T-4~5 tiếng** trước giờ tập → route tổng hợp số người "Có" so với `min_required`:
   - **Đủ người:** gửi thông báo xác nhận vào **nhóm ①** + **nhóm ②**, không cần thao tác thêm.
   - **Thiếu người:** gửi thông báo vào **nhóm ② (Ban quản trị)** kèm nút inline "Tạo bài tuyển vãng lai" (deep-link mở Mini App, tự điền sẵn ngày/giờ buổi đó) → admin mở Mini App, xác nhận số lượng cần tuyển → hệ thống điền vào `recruit_templates` → trả về nội dung bài đăng hoàn chỉnh → admin bấm **Copy** → dán thủ công vào các link đã lưu ở `fb_group_links` (app hiện sẵn từng link để mở nhanh).

### 5.2. Tính chi phí sau buổi tập
1. Sau giờ kết thúc buổi tập ~10 phút, bot nhắc admin trong **nhóm ② (Ban quản trị)** vào Mini App nhập số lượng vật phẩm đã dùng (dựa theo danh mục đã cấu hình sẵn ở `item_configs`, ví dụ: X trái cầu, Y chai nước).
2. Admin nhập số lượng trên Mini App → hệ thống tính:
   `tổng tiền = Σ (số lượng × đơn giá)`
   rồi chia đều cho số người **có mặt thực tế** trong buổi đó (dựa vào `attendance.answer = present`, hoặc điểm danh thực tế nếu có bổ sung).
3. Lưu kết quả vào `session_costs`, cộng dồn vào sao kê tháng của từng người liên quan, đồng thời gửi kết quả tổng tiền vừa tính vào **nhóm ②** để admin nắm.

### 5.3. Sao kê cuối tháng & thanh toán
1. Đến ngày cấu hình sẵn trong `settings.monthly_settlement_day`, cron trigger job tổng hợp: với mỗi member, cộng tất cả `session_costs` các buổi họ tham gia trong tháng → tạo `monthly_statements`.
2. Bot gửi sao kê:
   - Gửi vào **nhóm ③ (group riêng của từng member)** — nội dung: số buổi tham gia, chi tiết từng buổi, tổng tiền cần đóng.
   - Đồng thời gửi bản tổng hợp toàn CLB vào **nhóm ②**.
3. Member thanh toán ngoài app (chuyển khoản) → bấm nút inline **"Tôi đã thanh toán"** ngay trong **nhóm ③** → status chuyển `paid_reported` → bot đồng thời báo vào **nhóm ②** để admin biết có người chờ duyệt.
4. Admin vào Mini App xem danh sách chờ duyệt → **duyệt** → status chuyển `approved` → bot tự động gửi thông báo vào **nhóm ①**: *"Thành viên X đã thanh toán tháng Y."*

---

## 6. Xử lý lịch trình (Cron) — chi tiết kỹ thuật

Vì Vercel Hobby free chỉ cho cron chạy 1 lần/ngày (không đáp ứng đủ mốc giờ cần thiết), khuyến nghị:

- Tạo 1 route duy nhất: `POST /api/cron/tick`, bảo vệ bằng header `Authorization: Bearer <CRON_SECRET>`.
- Dùng dịch vụ cron ngoài **miễn phí** (ví dụ `cron-job.org`) gọi route này mỗi **1–5 phút**.
- Trong route, so sánh thời gian hiện tại với các "sự kiện cần chạy" được tính từ `settings` + `sessions` (ví dụ: đã đến giờ gửi poll chưa, đã đến mốc chốt điểm danh chưa, đã đến ngày sao kê tháng chưa...). Nếu đúng mốc và **chưa từng chạy job đó** (đánh dấu bằng 1 field `last_triggered_at` trên `sessions`/`settings` để tránh chạy trùng) thì mới thực thi.
- Cách này linh hoạt hơn cả cron gốc của Vercel (vốn chỉ chạy 1 lần/ngày và không chính xác theo phút), vẫn hoàn toàn miễn phí.
- Nếu sau này nâng cấp Vercel Pro ($20/tháng), có thể chuyển sang cron built-in với độ chính xác từng phút — nhưng ở quy mô hiện tại là không cần thiết.

---

## 7. Xác thực & bảo mật

- **Admin login**: xác thực bằng `Telegram WebApp initData` (chuẩn chính thức của Telegram Mini App) — verify chữ ký HMAC-SHA256 bằng bot token ở BE, chỉ `telegram_id` nằm trong danh sách admin lưu ở DB mới được cấp session (JWT lưu cookie).
- **Cron endpoint**: bảo vệ bằng secret token riêng, không public.
- **Webhook Telegram**: có thể thêm `secret_token` khi `setWebhook` để Telegram xác thực ngược lại, tránh giả mạo request.
- Bot token, MongoDB URI, các secret → lưu trong Vercel Environment Variables, không hard-code.

---

## 8. Giới hạn của các dịch vụ free — tóm tắt

| Dịch vụ | Giới hạn free | Ảnh hưởng đến dự án |
|---|---|---|
| Vercel Hobby | Cron 1 lần/ngày, không chính xác theo phút; function timeout mặc định 10s | Dùng cron-job.org thay thế (mục 1.1/6); logic xử lý mỗi lần gọi nên gọn, tránh vượt 10s |
| MongoDB Atlas M0 | 512MB storage | Dư dùng nhiều năm với quy mô 1 CLB vài chục người |
| Telegram Bot API | Miễn phí, gần như không giới hạn ở quy mô nhỏ; bot không tự tạo được group | Nhóm riêng cho sao kê cần tạo thủ công 1 lần (mục 1.3) |
| cron-job.org | Free, **không giới hạn số job**, chạy tới 60 lần/giờ | Thoải mái đáp ứng nhu cầu 3-5 trigger/ngày, kể cả nhiều hơn |

→ **Có thể triển khai và vận hành hoàn toàn miễn phí** ở quy mô 1 CLB.

---

## 9. Roadmap triển khai đề xuất

- **Phase 1 – MVP**: Setup bot + webhook, kết nối MongoDB, Mini App xác thực admin cơ bản, admin **bấm tay** để gửi poll điểm danh (chưa cần cron tự động) — để test luồng core sớm.
- **Phase 2**: Tự động hoá lịch trình qua cron ngoài (gửi poll đúng giờ, tự chốt đủ/thiếu).
- **Phase 3**: Tính chi phí buổi tập (nhập vật phẩm → chia tiền).
- **Phase 4**: Module tuyển vãng lai (template bài đăng + danh sách link FB group).
- **Phase 5**: Sao kê tháng + luồng báo đã thanh toán + admin duyệt + thông báo group.
- **Phase 6**: Polish UI Mini App, thêm dashboard thống kê (số buổi/chi phí theo tháng, lịch sử thanh toán từng người).

---

## 10. Tech stack chi tiết

- **Next.js 14+ (App Router) + TypeScript** — FE (Mini App UI) và BE (API routes) chung 1 project.
- **Thư viện gọi Telegram Bot API**: `node-telegram-bot-api` hoặc `Telegraf`, hoặc gọi REST trực tiếp bằng `fetch` (API khá đơn giản, có thể không cần thư viện).
- **Telegram WebApp SDK**: script `telegram-web-app.js` (CDN chính thức của Telegram) để lấy `initData`, điều khiển UI Mini App (theme, main button...).
- **MongoDB** qua Mongoose hoặc driver gốc `mongodb`.
- **Tailwind CSS** cho UI admin trong Mini App.
- **Deploy**: Vercel (kết nối GitHub repo, auto deploy khi push).
- **Cron ngoài**: cron-job.org (free) hoặc tương đương, gọi `/api/cron/tick`.

---

## 11. Rủi ro cần lưu ý khi vận hành thực tế

- **Facebook**: chỉ generate nội dung, không cố auto-post — đã xác nhận đúng hướng ở mục 1.2.
- **Setup nhóm ban đầu**: cần tạo sẵn nhóm ① (chính) và nhóm ② (Ban quản trị), add bot vào cả hai, lấy `chat_id` lưu vào `settings` — làm 1 lần khi triển khai.
- **Group riêng cho sao kê (nhóm ③)**: mỗi khi có thành viên mới, cần nhớ thao tác thủ công 1 lần (tạo group + add bot + lấy `chat_id`); nên đưa bước này vào checklist onboarding thành viên mới để không bị quên.
- **Timezone**: cron-job.org và Vercel function nên thống nhất xử lý theo giờ Việt Nam (UTC+7) ngay trong logic, tránh nhầm giờ UTC/local.
- **Trùng lặp trigger**: cần cơ chế đánh dấu "đã chạy" cho từng sự kiện (poll, nhắc chi phí, sao kê tháng) để tránh route `/api/cron/tick` gọi nhiều lần trong ngày mà gửi noti trùng.
- **Phụ thuộc dịch vụ ngoài**: cron-job.org là dịch vụ miễn phí của bên thứ 3, nên cân nhắc thêm 1 job dự phòng (GitHub Actions/UptimeRobot) trỏ cùng endpoint để tránh gián đoạn nếu dịch vụ chính gặp sự cố.
