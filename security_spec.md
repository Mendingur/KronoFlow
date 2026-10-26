# Đặc tả Bảo mật Firestore (Security Specification — Phase 0)

## 1. Bất biến Dữ liệu (Data Invariants)
1. **Master Gate & Relational Sync**: Mọi tài liệu con trong `/users/{userId}/transactions/{transactionId}`, `/users/{userId}/habits/{habitId}`, và `/users/{userId}/tasks/{taskId}` BẮT BUỘC phải thuộc về tài liệu cha `/users/{userId}` đã tồn tại (`exists()`) và có `ownerId == request.auth.uid`.
2. **Xác thực Danh tính & Email**: Mọi thao tác đọc/ghi chuẩn đều yêu cầu người dùng đã đăng nhập (`request.auth != null`), đã xác minh email (`request.auth.token.email_verified == true`), và `userId == request.auth.uid`.
3. **Chống Update-Gap & Shadow Fields**: Mọi thao tác `create` và `update` đều phải đi qua hàm kiểm tra blueprint `isValidUserSettings`, `isValidTransaction`, `isValidHabit`, `isValidTask` với kiểm tra khóa nghiêm ngặt (`hasAll` và `hasOnly`).
4. **Tính bất biến (Immortal Fields) & Thời gian máy chủ (Temporal Integrity)**: Trường `ownerId` và `createdAt` không bao giờ được thay đổi khi `update`. Trường `createdAt` khi tạo mới và `updatedAt` khi tạo/cập nhật phải khớp chính xác với `request.time`.
5. **Giới hạn Kích thước (Denial of Wallet Guard)**: Mọi ID đường dẫn phải thỏa mãn `isValidId(id)` (`<= 128` ký tự, regex `^[a-zA-Z0-9_\-]+$`). Mọi chuỗi văn bản và mảng (`completedDates.size() <= 366`) đều có giới hạn kích thước rõ ràng.

## 2. 12 Payload Tấn công ("Dirty Dozen" Payloads)
1. **Payload 1 (Unauthenticated Write)**: Ghi vào `/users/user_1` khi `request.auth == null` -> `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Spoofing)**: Ghi vào `/users/user_1` với `email_verified: false` -> `PERMISSION_DENIED`.
3. **Payload 3 (Cross-User Identity Spoofing)**: Người dùng `user_2` ghi vào `/users/user_1` hoặc đặt `ownerId: "user_1"` -> `PERMISSION_DENIED`.
4. **Payload 4 (Shadow Field Injection on Create)**: Gửi thêm trường lạ `isAdmin: true` khi tạo `/users/user_1` -> `PERMISSION_DENIED`.
5. **Payload 5 (Shadow Field Injection on Update)**: Cập nhật `/users/user_1` kèm trường lạ `hacked: 1` -> `PERMISSION_DENIED`.
6. **Payload 6 (Immortal Field Mutation)**: Cập nhật `createdAt` hoặc `ownerId` trên `/users/user_1` -> `PERMISSION_DENIED`.
7. **Payload 7 (Forged Client Timestamp)**: Gửi `updatedAt` khác `request.time` -> `PERMISSION_DENIED`.
8. **Payload 8 (ID Poisoning Attack)**: Tạo giao dịch với `transactionId` chứa ký tự đặc biệt hoặc dài hơn 128 ký tự -> `PERMISSION_DENIED`.
9. **Payload 9 (Orphaned Subcollection Write)**: Tạo `/users/user_1/transactions/tx_1` khi `/users/user_1` chưa tồn tại -> `PERMISSION_DENIED`.
10. **Payload 10 (Value Poisoning on Transaction)**: Cập nhật `amount` thành kiểu chuỗi `"1000000"` hoặc số âm -> `PERMISSION_DENIED`.
11. **Payload 11 (Unbounded Array Exhaustion)**: Gửi `completedDates` chứa hơn 366 phần tử hoặc phần tử đầu tiên không phải `string` -> `PERMISSION_DENIED`.
12. **Payload 12 (Unauthorized List Query Scraping)**: Người dùng `user_2` thực hiện truy vấn `list` trên `/users/user_1/tasks` -> `PERMISSION_DENIED`.
