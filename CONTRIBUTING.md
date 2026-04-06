# 🤝 Projeye Katkı Sağlama Rehberi (Contributing)

Öncelikle bu projeye ilgi gösterdiğiniz için teşekkür ederiz! Bu proje, güvenli web geliştirme standartlarını ve verimli middleware mimarilerini (Cheap Check First) öğretmek ve geliştirmek amacıyla oluşturulmuştur.

## 🚀 Nasıl Başlanır?

1. **Repoyu Klonlayın:**
   ```bash
   git clone https://github.com/hizir777/Middleware_selection.git
   ```

2. **Bağımlılıkları Yükleyin:**
   ```bash
   npm install
   ```

3. **Özellik Dalı (Feature Branch) Oluşturun:**
   ```bash
   git checkout -b feature/yeniozellik
   ```

4. **Değişikliklerinizi Yapın ve Test Edin:**
   ```bash
   npm test
   ```

## 📜 Kod Standartlarımız

- **ESLint:** Kod yazımında mevcut lint kurallarına uyun (`npm run lint`).
- **JSDoc:** Eklediğiniz tüm fonksiyonlara JSDoc blokları ekleyin.
- **Temiz Kod:** Fonksiyonlar tek bir iş yapmalı (Single Responsibility Principle).

## 🧪 Test Süreci

Yeni bir özellik eklediğinizde lütfen:
1. `tests/middleware.test.js` içine bir unit test ekleyin.
2. `npm run test:all` komutuyla tüm pipeline'ın çalıştığından emin olun.

## 📝 Commit Mesajları

Lütfen [Conventional Commits](https://www.conventionalcommits.org/) standartlarını kullanın:
- `feat:` Yeni bir özellik eklendiğinde.
- `fix:` Bir hata giderildiğinde.
- `docs:` Dokümantasyon değişikliğinde.
- `refactor:` Kod yapısı iyileştirildiğinde (fonksiyonel değişim yoksa).

## 🆘 Sorun Bildirme

Bir hata bulursanız veya bir özellik öneriniz varsa lütfen [GitHub Issues](https://github.com/hizir777/Middleware_selection/issues) sekmesini kullanın.

---
*Geliştirdiğimiz her satır kod, daha güvenli bir web için bir adımdır.* 🛡️
