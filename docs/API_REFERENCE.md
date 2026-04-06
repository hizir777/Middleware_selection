# 📖 API Teknik Referans Belgesi (v1.0.0)

Bu belge, **Middleware Selection** projesinin sunduğu tüm API endpoint'lerini, beklenen parametreleri ve yanıt modellerini detaylı olarak açıklar.

---

## 🔐 Kimlik Doğrulama Katmanları

Tüm korumalı rotalar (`Protected`) şu hiyerarşiden geçer:
1. **Rate Limiting:** `ratelimit:<ip>` (Redis)
2. **Auth Guard:** `Authorization: Bearer <token>`
3. **Session Verification:** Token kara listede mi? (Redis)
4. **Fingerprint Match:** IP + User-Agent uyumlu mu?

---

## 📡 Kamu Rotaları (Public Routes)

### 1. Sistem Sağlık Kontrolü
Sistemin ve veritabanı bağlantılarının durumunu döner.

- **URL:** `/api/health`
- **Method:** `GET`
- **Auth:** Gerekmez
- **Yanıt (200 OK):**
```json
{
  "success": true,
  "data": {
    "app": "✅",
    "redis": "✅ Connected",
    "uptime": "0d 2h 15m"
  }
}
```

### 2. Kullanıcı Kaydı
Sisteme yeni bir kullanıcı ekler.

- **URL:** `/api/auth/register`
- **Method:** `POST`
- **Body:**
  - `username` (string, min 3): Kullanıcı adı.
  - `email` (string, valid): E-posta adresi.
  - `password` (string, min 6): Şifre.
  - `role` (string, optional): `student`, `editor` veya `admin` (Varsayılan: `student`).
- **Yanıt (201 Created):**
```json
{
  "success": true,
  "message": "Kullanıcı başarıyla oluşturuldu",
  "user": { "id": 1, "username": "can", "email": "can@example.com", "role": "student" }
}
```

### 3. Kullanıcı Girişi
JWT token üretir ve oturum başlatır.

- **URL:** `/api/auth/login`
- **Method:** `POST`
- **Body:** `email`, `password`
- **Yanıt (200 OK):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1...",
  "user": { "id": 1, "role": "admin" }
}
```

---

## 🛡️ Korumalı Rotalar (Protected Routes)

*Tüm bu rotalar için `Authorization: Bearer <JWT>` header'ı zorunludur.*

### 4. Oturum Kapatma (Logout)
JWT token'ı geçersiz kılar (Kara listeye alır).

- **URL:** `/api/auth/logout`
- **Method:** `POST`
- **Yanıt (200 OK):**
```json
{ "success": true, "message": "Oturum kapatıldı" }
```

### 5. Şifre Değiştirme
Şifreyi günceller ve güvenlik amacıyla **tüm aktif token'ları** iptal eder.

- **URL:** `/api/auth/change-password`
- **Method:** `POST`
- **Body:** `oldPassword`, `newPassword`

### 6. Kullanıcı Dashboard
Giriş yapmış her kullanıcının erişebildiği temel veri rotası.

- **URL:** `/api/dashboard`
- **Method:** `GET`
- **Min. Rol:** `student`

---

## 👔 Yetki Tabanlı Rotalar (RBAC)

### 7. Editor İçerik Paneli
- **URL:** `/api/editor/content`
- **Min. Rol:** `editor`

### 8. Admin Yönetim Paneli
- **URL:** `/api/admin/panel`
- **Min. Rol:** `admin`

### 9. Güvenlik Denetim Logları (Audit Logs)
Sistemdeki tüm güvenlik olaylarını (başarısız girişler, rate limit aşımları vb.) listeler.

- **URL:** `/api/audit-logs`
- **Method:** `GET`
- **Min. Rol:** `admin`

---

## ⚠️ Hata Kodları Sözlüğü

| Kod | Tanım | Neden? |
|-----|-------|--------|
| `400` | Bad Request | Eksik parametre veya validasyon hatası. |
| `401` | Unauthorized | Token yok, geçersiz veya parmak izi uyuşmazlığı. |
| `403` | Forbidden | Rol yetkisi yetersiz. |
| `429` | Too Many Requests | Rate limit sınırı aşıldı. |
| `500` | Internal Error | Beklenmedik sunucu hatası. |

---
*Son Güncelleme: 2026-04-06*
