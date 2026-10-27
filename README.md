# KronoFlow — Quản lý Chi tiêu, Kỷ luật & Công việc

Ứng dụng React + TypeScript + Vite + Tailwind chạy **100% trên trình duyệt** (không cần máy chủ), host miễn phí trên GitHub Pages:
**https://mendingur.github.io/KronoFlow/**

- **Tổng quan**, **Quản lý chi tiêu**, **Kỷ luật & Thói quen**, **Công việc hằng ngày**, **Trợ lý AI** (Gemini).
- Mỗi người dùng đăng nhập bằng Google; toàn bộ dữ liệu nằm trong tệp `kronoflow_database.json` trên **Google Drive của chính họ** (scope `drive.file`: ứng dụng chỉ thấy tệp do nó tạo).
- Luôn có bản đệm trong LocalStorage: mất mạng, hết phiên đăng nhập hay Drive đầy thì không mất thao tác vừa nhập, và sẽ tự đồng bộ khi ổn định lại.
- Cảnh báo khi tệp bị xóa / vào Thùng rác (có nút **Khôi phục dữ liệu lên Google Drive**) và khi Drive sắp đầy / đã đầy.
- Có nút **Dùng không cần đăng nhập**: dữ liệu chỉ lưu trong trình duyệt đó (không đồng bộ giữa các thiết bị). Có thể kết nối Google Drive sau, dữ liệu đang có sẽ được mang theo nếu Drive chưa có tệp.
- Mỗi người tự dán **Gemini API Key** của mình trong *Cài đặt* (lưu trong LocalStorage của trình duyệt đó). **Không** có khóa nào được ghi cứng trong mã nguồn.

## Thiết lập lần đầu (làm một lần)

### 1. Tạo OAuth Client ID (Google Cloud Console)
1. Vào <https://console.cloud.google.com/> → chọn/tạo một project → **APIs & Services → Library** → bật **Google Drive API**.
2. **APIs & Services → OAuth consent screen**: điền tên ứng dụng *KronoFlow*, email hỗ trợ. Mục *Audience*:
   - Để **Testing** thì chỉ các email trong danh sách *Test users* mới đăng nhập được.
   - Muốn **bất kỳ ai** dùng được: nhấn **Publish app → In production** (scope `drive.file` không cần thẩm định bảo mật).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → loại **Web application**:
   - *Authorized JavaScript origins*: `https://mendingur.github.io` (và `http://localhost:5173` nếu chạy thử máy bàn).
   - Không cần điền Redirect URI.
4. Sao chép **Client ID** (dạng `xxxx.apps.googleusercontent.com`). Client ID không phải bí mật.

### 2. Đưa Client ID vào ứng dụng (chọn 1 trong 2)
- **Khuyến nghị:** GitHub repo → **Settings → Secrets and variables → Actions → tab Variables → New repository variable**, tên `VITE_GOOGLE_CLIENT_ID`, giá trị là Client ID. Lần build kế tiếp sẽ tự dùng.
- Hoặc dán trực tiếp vào ô **GOOGLE_CLIENT_ID** trên màn hình đăng nhập / mục Cài đặt (lưu trên trình duyệt đó).

### 3. Bật GitHub Pages bằng GitHub Actions
GitHub repo → **Settings → Pages → Build and deployment → Source = _GitHub Actions_**.
(Nếu để *Deploy from a branch*, GitHub chỉ phát hành mã nguồn thô nên trang sẽ trắng.)
Mỗi lần `push` lên nhánh `main`, workflow `.github/workflows/deploy.yml` sẽ kiểm tra khóa lộ, chạy kiểm thử, build và xuất bản.

## Chạy trên máy

```bash
npm install
cp .env.example .env.local   # điền VITE_GOOGLE_CLIENT_ID (tùy chọn)
npm run dev                  # http://localhost:5173
npm test                     # kiểm thử đơn vị + kịch bản Google Drive giả lập
npm run build                # kiểm tra TypeScript + build ra thư mục dist/
```

## Cấu trúc chính

| Đường dẫn | Vai trò |
| :-- | :-- |
| `src/services/googleDriveService.ts` | Đăng nhập Google Identity Services, đọc/ghi/khôi phục `kronoflow_database.json`, kiểm tra dung lượng (`about?fields=storageQuota`), bắt lỗi `storageQuotaExceeded` |
| `src/services/localDatabase.ts` | Bản đệm LocalStorage gắn theo từng tài khoản, chuẩn hóa dữ liệu |
| `src/components/DriveProtectionModals.tsx` | Màn hình đăng nhập, trạng thái đồng bộ, banner nhắc không xóa tệp, hộp thoại Drive đầy / tệp bị xóa |
| `src/components/SettingsView.tsx` | Gemini API Key, GOOGLE_CLIENT_ID, tình trạng Drive, sao lưu JSON/CSV |
| `src/config/constants.ts` | Tên tệp, thông điệp cảnh báo, tên mô hình Gemini |

## Lưu ý quan trọng

- **Đừng xóa, đổi tên hoặc di chuyển** tệp `kronoflow_database.json` trong Google Drive của bạn.
- Không commit khóa API nào vào repo. Workflow sẽ dừng nếu phát hiện chuỗi dạng `AIza...` trong mã nguồn.
