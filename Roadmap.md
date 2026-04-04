**Güvenli Web Geliştirme Vize Projesi Yol Haritası**:

* 1. adım: Uptime Kuma analizi
* 2. adım: Vize projesi (Middleware Selection)

---

## 🛠️ Proje öngereksinimi : Uptime Kuma Analiz Yol Haritası

### Adım 1: Kurulum ve `install.sh` Analizi (Reverse Engineering)
Uptime Kuma genellikle `npm` veya `docker` üzerinden kurulur, ancak topluluk tarafından sağlanan veya manuel kurulum betikleri (`extra` klasörü altındakiler gibi) kritik önem taşır.
* **Görev:** Repodaki kurulum süreçlerini (özellikle Dockerfile ve paket yönetim dosyalarını) incele.
* **Odak Noktası:** `package.json` içindeki bağımlılıklar ve kurulum sırasında dışarıdan çekilen scriptler.
* **Kritik Soru:** Dış kaynaklar (CDN'ler, API'ler) çekilirken bütünlük kontrolü (SRI hash) yapılıyor mu? Kurulum sırasında sudo yetkisi gereksiz yere isteniyor mu?

### Adım 2: İzolasyon ve İz Bırakmadan Temizlik (Forensics)
* **Görev:** Uygulamayı bir VM (Virtual Machine) içinde ayağa kaldır ve çalışırken oluşturduğu dosyaları (SQLite veritabanı, loglar, `data` klasörü) haritalandır.
* **Yöntem:** Kurulum öncesi ve sonrası sistemin bir "snapshot"ını al. `lsof -i :3001` komutuyla hangi portun dinlendiğini ve hangi process'in (PID) aktif olduğunu dökümle.
* **İspat:** Uygulamayı sildikten sonra `/app/data` veya `/var/lib/docker` altında kalıntı kalıp kalmadığını kontrol eden bir "Cleanup Verification Script" hazırla.

### Adım 3: İş Akışları ve CI/CD Pipeline Analizi
Uptime Kuma'nın `.github/workflows` dizini oldukça kalabalıktır (frontend build, docker push vb.).
* **Görev:** `frontend-build.yml` veya `docker.yml` dosyasını seç.
* **Analiz:** Kod her push edildiğinde hangi testlerden geçiyor? Docker imajları hangi mimariler (arm64, amd64) için otomatik basılıyor?
* **Webhook Kavramı:** GitHub'ın bir olay (push/merge) olduğunda senin sunucuna veya bir servise "Hey, bir değişiklik oldu, hadi aksiyona geç!" diye fısıldamasıdır.

### Adım 4: Docker Mimarisi ve Konteyner Güvenliği
Uptime Kuma'nın kalbi Docker üzerinde atar.
* **Görev:** `Dockerfile`'ı satır satır oku. Base imaj olarak ne kullanılmış? (Örn: `node:alpine` mi yoksa daha ağır bir imaj mı?)
* **Güvenlik Katmanı:** Konteyner "root" yetkisiyle mi çalışıyor yoksa sınırlı bir kullanıcı (`node` kullanıcısı gibi) mı atanmış?
* **Karşılaştırma:** VM'ler tüm işletim sistemini sanallaştırırken, Docker'ın sadece uygulama katmanını izole ettiğini ve çekirdeği (kernel) paylaştığını vurgula.

### Adım 5: Kaynak Kod ve Tehdit Modelleme (Threat Modeling)
* **Entrypoint Tespiti:** Uygulamanın giriş noktası olan `server/server.js` (veya `src/` altındaki ana dosya) dosyasını bul.
* **Auth Mekanizması:** Uptime Kuma login ekranında şifreleri nasıl saklıyor? (Bcrypt/Argon2?). Socket.io bağlantılarında yetkilendirme nasıl yapılıyor?
* **Saldırı Senaryosu:** Bir saldırgan "Status Page" üzerinden SSRF (Server Side Request Forgery) saldırısı yapabilir mi? İzleme aracı olduğu için sunucunun iç ağını taramak için kullanılabilir mi?

---

### 📊 Rapor Taslağın (Template)

| Bölüm | İçerik | Teslim Edilecek Belge |
| :--- | :--- | :--- |
| **Giriş** | Proje amacı ve seçilen repo nedenleri. | Giriş metni |
| **Kurulum Analizi** | Script incelemesi ve güvenlik açıkları. | `install_analysis.md` |
| **Adli Analiz** | Kalıntı kontrolü ve silme kanıtları. | Log çıktıları ve Ekran Görüntüleri |
| **DevOps Analizi** | CI/CD akışı ve Webhook detayları. | Akış şeması (Mermaid.js vb.) |
| **Güvenlik Mimarisi** | Docker katmanları ve Rootless kontrolü. | Güvenlik Skor Tablosu |
| **Tehdit Modeli** | Entrypoint ve Auth zaafiyet analizi. | Saldırı Senaryosu Raporu |

---

# Vize Projesi

## 🗺️ Middleware Selection Yol Haritası

### 1. Aşama: Anatomi ve İskelet (Kurulum)
Öncelikle üzerinde deney yapacağımız "boş bir bina" (sunucu) inşa etmeliyiz.
* **Teknoloji Seçimi:** Express.js (Hızlı ve dökümantasyonu en bol olan seçenek).
* **Temel Yapı:** Basit bir `GET /dashboard` ve `POST /login` rotası oluştur.
* **Hedef:** İsteklerin (request) sunucuya ulaştığını ve yanıt (response) döndüğünü teyit et.

### 2. Aşama: Zabıta Hattı (Rate Limiting & Security Headers)
Kapının en dışına, en "ucuz" ve en hızlı kontrolleri yerleştiriyoruz.
* **Rate Limiter:** `express-rate-limit` kullanarak aynı IP'den gelen istekleri sınırla. (Zabıta: "Çok hızlı geliyorsun, yavaşla!")
* **Helmet.js:** Temel HTTP güvenlik başlıklarını (XSS koruması, Sniffing engeli) ekle.
* **Mantık:** Eğer bir bot binlerce istek atıyorsa, henüz veritabanına veya ağır şifre kontrolüne (Polis) gitmeden onu burada reddetmeliyiz.

### 3. Aşama: Gözetleme Kamerası (Logging)
Hocanın listesindeki "Logging" kısmını buraya yerleştiriyoruz.
* **Morgan veya Winston:** Gelen her isteğin metodunu, IP adresini ve sonucunu kaydet.
* **Kritik Karar:** Loglama işlemini hem en başta (tüm istekleri görmek için) hem de hata durumlarında (reddedilenleri görmek için) nasıl kurguladığını raporla.

### 4. Aşama: Polis Hattı (Authentication & Authorization)
İçeri girmeye hak kazanan az sayıdaki kişiye kimlik soruyoruz.
* **JWT Kontrolü:** İstek başlığındaki (Header) token'ı doğrula. (Polis: "Kimliğini göreyim, GBT yapalım.")
* **CPU Maliyeti:** Burada şifre çözme veya veritabanı sorgusu yapıldığı için bu aşama "pahalıdır". Bu yüzden 2. aşamadan sonra gelmelidir.
* **Önemli:** Eğer token geçersizse, isteği bir sonraki adıma (Business Logic) asla geçirme.

### 5. Aşama: Deney ve İspat
İşte projenin "neden" yapıldığını kanıtladığın yer.
* **Senaryo A (Doğru Sıra):** Önce Rate Limit -> Sonra Auth. Bir saldırı simüle et (saniyede 1000 istek). Sunucunun CPU kullanımının düşük kaldığını göster (Çünkü Zabıta botları hemen kovdu).
* **Senaryo B (Yanlış Sıra):** Önce Auth -> Sonra Rate Limit. Aynı saldırıyı yap. Sunucunun her istekte "kimlik doğrulamaya" çalıştığı için kilitlendiğini (CPU tavan) göster.

---

## 📊 Özet Performans Tablosu (Raporun İçin)

| Katman | Görevli | Maliyet (CPU/RAM) | Neden Bu Sırada? |
| :--- | :--- | :--- | :--- |
| **1. Rate Limit** | Zabıta | Çok Düşük | Kaba kuvvet saldırılarını en başta, sistemi yormadan elemek için. |
| **2. Logging** | Kamera | Orta | Kimin girip kimin giremediğinin kaydını tutmak için. |
| **3. Auth (JWT)** | Polis | Yüksek | Sadece "yavaş ve gerçek" kullanıcılara ağır kimlik kontrolü yapmak için. |
| **4. Controller** | İçerisi | Değişken | Temizlenmiş ve doğrulanmış veriyle asıl işi yapmak için. |

---
