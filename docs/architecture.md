# Mimari Dökümantasyon — Middleware Selection

## Pipeline Akış Şeması

```mermaid
flowchart TD
    A["🌐 Client Request"] --> B{"1️⃣ Rate Limiter\n(Yunus Polisi)\n~0.1ms | Redis"}
    B -->|"Limit Aşıldı"| R429["🛑 429 Too Many Requests\n(Auth/DB'ye ULAŞMAZ)"]
    B -->|"Geçti"| C{"2️⃣ CORS Handler\n~0.01ms | Bellek"}
    C -->|"Origin Reddi"| RCORS["🚫 CORS Error"]
    C -->|"Geçti"| D["3️⃣ Helmet\nGüvenlik Header\n~0.01ms"]
    D --> E["4️⃣ Body Parser\nJSON Ayrıştırma\n~0.5ms"]
    E --> F["5️⃣ Request Logger\nRequest ID + Timing\n~1ms"]
    F --> G{"6️⃣ Auth Guard\n(Polis)\n~5-10ms | CPU+Redis"}
    G -->|"Token Yok/Geçersiz"| R401["🔒 401 Unauthorized"]
    G -->|"Token İptal Edilmiş"| R401Rev["🔒 401 Token Revoked"]
    G -->|"Parmak İzi Uyumsuz"| WARN["⚠️ Telegram Bildirimi\n(Session Hijack Warning)"]
    WARN --> H
    G -->|"Geçti"| H{"7️⃣ RBAC Guard\n(Zabıta)\n~2ms | DB"}
    H -->|"Yetkisiz"| R403["⛔ 403 Forbidden"]
    H -->|"Geçti"| I["✅ Controller\n(İş Mantığı)"]
    I --> J["📤 Response"]
```

## Token Yaşam Döngüsü

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant R as Redis
    participant DB as SQLite

    C->>S: POST /api/auth/login
    S->>DB: Kullanıcı ve şifre kontrolü
    DB-->>S: Kullanıcı bilgileri
    S->>S: bcrypt.compare()
    S->>S: JWT.sign() + jti oluştur
    S->>R: SADD user_tokens:{id} {jti}
    S-->>C: { token: "eyJ..." }

    Note over C,R: --- Şifre Değişikliği ---

    C->>S: POST /api/auth/change-password
    S->>R: SMEMBERS user_tokens:{id}
    R-->>S: [jti1, jti2, ...]
    S->>R: SET revoked:{jti1} 1 EX 3600
    S->>R: SET revoked:{jti2} 1 EX 3600
    S->>R: DEL user_tokens:{id}
    S-->>C: { success: true }

    Note over C,R: --- Eski Token ile Erişim ---

    C->>S: GET /api/dashboard (eski token)
    S->>S: JWT.verify() ✅ (süre dolmadı)
    S->>R: GET revoked:{jti}
    R-->>S: "1" (İPTAL EDİLMİŞ)
    S-->>C: 401 "Bu token iptal edilmiş"
```

## Parmak İzi (Fingerprint) Mekanizması

```mermaid
flowchart LR
    subgraph "Request Verileri"
        IP["IP Adresi"]
        UA["User-Agent"]
        SR["Ekran Çözünürlüğü\n(X-Screen-Resolution)"]
    end

    IP --> HASH["SHA-256\nHash"]
    UA --> HASH
    SR --> HASH

    HASH --> FP["Fingerprint\n(64 hex karakter)"]

    FP --> CMP{"Kayıtlı FP\nile Karşılaştır"}

    CMP -->|"Eşleşti ✅"| OK["Devam Et"]
    CMP -->|"Eşleşmedi ⚠️"| ALERT["Telegram Uyarısı\n+ Log Kaydı"]
    ALERT --> OK
```

## Performans Karşılaştırması

### Doğru Sıra (Cheap Check First)

```
İstek #1-10:  Rate Limit OK → Auth → Controller  (toplam ~15ms)
İstek #11+:   Rate Limit 429 → DURDURULDU         (toplam ~0.1ms)
                                ↑
                          Auth/DB HİÇ çağrılmadı
```

### Yanlış Sıra (Auth Önde)

```
İstek #1-∞:   Auth (crypto.verify ~5ms) → Rate Limit → Controller
                     ↑
               HER istekte crypto çalışır
               DDoS'ta CPU tavan yapar!
```

## Veri Akışı

| Veri Tipi | Depolama | Erişim Süresi | Kullanım |
|-----------|----------|---------------|----------|
| Rate limit sayaçları | Redis | ~0.1ms | Hız sınırlama |
| İptal edilen token'lar | Redis (TTL) | ~0.1ms | Token blacklist |
| Aktif token set'leri | Redis (Set) | ~0.1ms | Toplu iptal |
| Kullanıcı bilgileri | SQLite | ~1-2ms | Auth, profil |
| Audit logları | SQLite | ~1-2ms | Güvenlik kaydı |
