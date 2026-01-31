# 一人美髮工作室預約系統

極簡預約系統，讓客人查看「已滿時段」，雇主透過 LINE Bot 記錄預約。

## 功能

- **客人端**：掃 QR Code 查看已滿時段（唯讀）
- **雇主端**：在 LINE 群組轉傳預約訊息，Bot 自動記錄

## 設定步驟

### 1. 建立 Google Sheets

1. 建立新的 Google Sheets
2. 複製 Spreadsheet ID（網址中 `d/` 和 `/edit` 之間的字串）
3. 記下這個 ID，稍後會用到

### 2. 設定 Google Apps Script

1. 在 Google Sheets 中，點選「擴充功能」→「Apps Script」
2. 將 `google-apps-script/Code.gs` 的內容貼上
3. 修改以下設定：
   ```javascript
   const LINE_CHANNEL_ACCESS_TOKEN = '你的 LINE Token';
   const SPREADSHEET_ID = '你的 Spreadsheet ID';
   ```
4. 執行 `initializeSheets` 函數，初始化工作表結構
5. 部署為 Web App：
   - 點選「部署」→「新增部署作業」
   - 選擇「網頁應用程式」
   - 執行身分：我
   - 存取權限：任何人
   - 點選「部署」
6. 複製 Web App URL

### 3. 設定 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立新的 Provider（如果還沒有）
3. 建立新的 Messaging API Channel
4. 在 Messaging API 設定中：
   - 啟用 Webhook
   - 設定 Webhook URL 為 Google Apps Script 的 Web App URL
   - 關閉「自動回應訊息」
   - 關閉「加入好友的歡迎訊息」
5. 複製 Channel Access Token
6. 將 Token 貼回 Google Apps Script

### 4. 設定客人查看頁面

1. 編輯 `js/app.js`，將 `API_URL` 改為你的 Web App URL：
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/AKfycbzKz6eaYdzPjasqR0MPoWSJnUVz2Vpq65sGHHZPbK_wFEe0CpCQh-HvXhnw_4TUXvk/exec';
   ```
2. 將檔案上傳到 GitHub Pages 或其他靜態網頁主機

### 5. 產生 QR Code

使用任何 QR Code 產生器，將網頁網址轉為 QR Code，印出放在店內。

## 使用方式

### 雇主 - 新增預約

在 LINE 群組（或與 Bot 的對話）輸入：

```
預約 日期 時間 姓名 電話 服務
```

範例：
```
預約 2/1 10:00 王小姐 0912345678 剪髮
預約 2/1 14:00 李先生 0923456789 全染
```

Bot 會回覆確認：
```
✅ 已登記
2月1日 14:00 ~ 16:00
李先生 全染（2小時）
```

### 雇主 - 取消預約

```
取消 日期 時間
```

範例：
```
取消 2/1 14:00
```

### 雇主 - 查詢預約

```
查詢 日期
```

範例：
```
查詢 2/1
```

### 客人 - 查看已滿時段

掃描 QR Code 或開啟網頁，即可看到已滿的時段。

## 服務項目與時長

| 服務 | 時長 |
|------|------|
| 剪 / 剪髮 | 20 分鐘 |
| 洗剪 | 30 分鐘 |
| 補染 | 90 分鐘 |
| 全染 / 染髮 | 120 分鐘 |
| 燙 / 燙髮 | 150 分鐘 |
| 染燙 | 210 分鐘 |
| 護髮 | 60 分鐘 |

可在 Google Sheets 的 `Services` 工作表中新增或修改。

## 自訂設定

在 Google Sheets 的 `Settings` 工作表中修改：

| 項目 | 說明 |
|------|------|
| shop_name | 店名 |
| contact_phone | 聯絡電話 |
| contact_line | LINE ID |
| slot_interval | 時段間隔（分鐘） |

## 成本

全部免費！

- LINE Official Account：免費（500 則/月）
- GitHub Pages：免費
- Google Sheets：免費
- Google Apps Script：免費

## 檔案結構

```
hair-salon-booking/
├── index.html              # 客人查看頁面
├── css/
│   └── style.css           # 樣式
├── js/
│   └── app.js              # 前端邏輯
├── google-apps-script/
│   └── Code.gs             # 後端邏輯
└── README.md               # 說明文件
```
