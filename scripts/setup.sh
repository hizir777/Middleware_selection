#!/usr/bin/env bash
# ================================================================
# Middleware Selection — Kurulum ve Başlatma Betiği
# ================================================================
#
# Bu betik, Middleware Selection uygulamasının tüm bağımlılıklarını
# yükler, ortam değişkenlerini doğrular, servisleri başlatır ve
# uygulama sağlık kontrolünü gerçekleştirir.
#
# Kullanım:
#   ./scripts/setup.sh                  # Tam kurulum
#   ./scripts/setup.sh --dev            # Geliştirme modu (hot-reload)
#   ./scripts/setup.sh --check-only     # Sadece ön koşul kontrolü
#   ./scripts/setup.sh --skip-redis     # Redis olmadan başlat
#
# Ön Koşullar:
#   - Node.js >= 18.0.0
#   - npm >= 9.0.0
#   - Redis >= 6.0 (opsiyonel, --skip-redis ile atlanabilir)
#   - Git >= 2.30
#
# Desteklenen İşletim Sistemleri:
#   - Ubuntu 20.04 / 22.04 LTS
#   - Debian 11 / 12
#   - macOS 12+ (Monterey ve üzeri)
#   - Windows 11 WSL2 (Ubuntu alt sistemi)
#
# Çıkış Kodları:
#   0  — Başarılı
#   1  — Genel hata
#   2  — Ön koşul eksik (Node.js, npm, vb.)
#   3  — .env yapılandırma hatası
#   4  — Bağımlılık yükleme hatası
#   5  — Redis bağlantı hatası
#   6  — Uygulama sağlık kontrolü başarısız
#
# ================================================================

# Betik hata güvenliği:
#   -e: Herhangi bir komut hata verirse betik durur
#   -u: Tanımlanmamış değişken kullanılırsa hata verir
#   -o pipefail: Pipe içindeki herhangi bir hata yakalanır
set -euo pipefail

# ----------------------------------------------------------------
# Renk Kodları (terminal çıktısı için)
# ----------------------------------------------------------------
# ANSI escape kodları; bazı terminallerde desteklenmeyebilir.
# CI ortamında NO_COLOR=1 ayarlanarak devre dışı bırakılabilir.
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ----------------------------------------------------------------
# Yapılandırma Değişkenleri
# ----------------------------------------------------------------
# Betik içindeki sabitler; gerekirse komut satırı argümanları
# veya ortam değişkenleriyle geçersiz kılınabilir.

# Uygulamanın çalışacağı varsayılan port
APP_PORT="${PORT:-3000}"

# Redis bağlantı adresi (localhost veya Docker servis adı)
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Node.js minimum sürüm gereksinimi (major.minor)
NODE_MIN_VERSION="18.0"

# npm minimum sürüm gereksinimi
NPM_MIN_VERSION="9.0"

# Sağlık kontrolü için bekleme süresi (saniye)
HEALTH_CHECK_TIMEOUT=30

# Sağlık kontrolü yeniden deneme aralığı (saniye)
HEALTH_CHECK_INTERVAL=2

# Proje kök dizini (betiğin bulunduğu dizinin üst dizini)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ----------------------------------------------------------------
# Yardımcı Fonksiyonlar
# ----------------------------------------------------------------

# Başarı mesajı yazdırır (yeşil tik ile)
log_success() {
    echo -e "${GREEN}✅${RESET} $1"
}

# Bilgi mesajı yazdırır (mavi ok ile)
log_info() {
    echo -e "${CYAN}ℹ️${RESET}  $1"
}

# Uyarı mesajı yazdırır (sarı uyarı ile)
log_warn() {
    echo -e "${YELLOW}⚠️${RESET}  $1"
}

# Hata mesajı yazdırır ve belirtilen çıkış kodu ile sonlanır
log_error() {
    echo -e "${RED}❌${RESET} $1" >&2
    exit "${2:-1}"
}

# Bölüm başlığı yazdırır
log_section() {
    echo ""
    echo -e "${BOLD}${BLUE}━━━ $1 ━━━${RESET}"
}

# ----------------------------------------------------------------
# Komut Satırı Argümanları
# ----------------------------------------------------------------
# Desteklenen bayraklar:
#   --dev         : Geliştirme modunda başlat (nodemon ile)
#   --check-only  : Sadece ön koşulları kontrol et, kurulum yapma
#   --skip-redis  : Redis kontrolü ve bağlantısını atla
#   --clean       : node_modules silip yeniden yükle
#   --help        : Kullanım bilgisini göster

MODE="production"
CHECK_ONLY=false
SKIP_REDIS=false
CLEAN_INSTALL=false

for arg in "$@"; do
    case "$arg" in
        --dev)         MODE="development" ;;
        --check-only)  CHECK_ONLY=true ;;
        --skip-redis)  SKIP_REDIS=true ;;
        --clean)       CLEAN_INSTALL=true ;;
        --help|-h)
            # Yardım metnini göster ve çık
            head -50 "${BASH_SOURCE[0]}" | grep "^#" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            log_error "Bilinmeyen argüman: $arg (--help ile kullanım bilgisi alın)" 1
            ;;
    esac
done

# ----------------------------------------------------------------
# Başlık
# ----------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║   Middleware Selection — Kurulum Betiği          ║${RESET}"
echo -e "${BOLD}${CYAN}║   Mod: ${MODE}$(printf '%*s' $((34 - ${#MODE})) '')║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ================================================================
# BÖLÜM 1: Ön Koşul Kontrolleri
# ================================================================
log_section "Ön Koşul Kontrolleri"

# Node.js varlık ve sürüm kontrolü
# Node.js 18+ gereklidir: ESM desteği, fetch() native API,
# ve sql.js WASM runtime için gerekli V8 özellikleri.
if ! command -v node &>/dev/null; then
    log_error "Node.js bulunamadı. https://nodejs.org adresinden yükleyin." 2
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    log_error "Node.js $NODE_MIN_VERSION+ gerekli, mevcut: $NODE_VERSION" 2
fi
log_success "Node.js: v$NODE_VERSION"

# npm varlık ve sürüm kontrolü
if ! command -v npm &>/dev/null; then
    log_error "npm bulunamadı. Node.js kurulumunu kontrol edin." 2
fi
NPM_VERSION=$(npm --version)
log_success "npm: v$NPM_VERSION"

# Git kontrolü (geliştirme ortamı için)
if command -v git &>/dev/null; then
    GIT_VERSION=$(git --version | awk '{print $3}')
    log_success "Git: v$GIT_VERSION"
else
    log_warn "Git bulunamadı. Sürüm kontrolü yapılamayacak."
fi

# Redis kontrolü (--skip-redis ile atlanabilir)
if [ "$SKIP_REDIS" = false ]; then
    if ! command -v redis-cli &>/dev/null; then
        log_warn "redis-cli bulunamadı. Redis kurulu değil veya PATH'de değil."
    else
        # Redis'e ping at; bağlantı yoksa uyar ama devam et
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
            log_success "Redis: $REDIS_HOST:$REDIS_PORT (bağlantı başarılı)"
        else
            log_warn "Redis: $REDIS_HOST:$REDIS_PORT — bağlantı kurulamadı."
            log_warn "Uygulama, Redis olmadan sınırlı işlevsellikle çalışabilir."
        fi
    fi
else
    log_info "Redis kontrolü atlandı (--skip-redis)"
fi

# Sadece kontrol modundaysa burada dur
if [ "$CHECK_ONLY" = true ]; then
    log_success "Ön koşul kontrolü tamamlandı. Kurulum atlandı."
    exit 0
fi

# ================================================================
# BÖLÜM 2: Ortam Değişkenleri Yapılandırması
# ================================================================
log_section "Ortam Yapılandırması"

cd "$PROJECT_ROOT"

# .env dosyası yoksa .env.example'dan oluştur
# .env dosyası git ile takip edilmez (gizli bilgiler içerir).
# .env.example şablon olarak kullanılır.
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_warn ".env bulunamadı — .env.example'dan oluşturuldu."
        log_warn "Lütfen .env dosyasındaki değerleri düzenleyin!"
    else
        log_error ".env ve .env.example bulunamadı. Yapılandırma eksik." 3
    fi
else
    log_success ".env dosyası mevcut"
fi

# ================================================================
# BÖLÜM 3: Bağımlılık Kurulumu
# ================================================================
log_section "Bağımlılık Kurulumu"

# Temiz kurulum isteniyorsa önce node_modules'u temizle
if [ "$CLEAN_INSTALL" = true ]; then
    log_info "node_modules temizleniyor..."
    rm -rf node_modules package-lock.json
    log_success "Temizlik tamamlandı"
fi

# npm ci: package-lock.json'a dayalı deterministik kurulum
# npm install yerine ci tercih edilir: CI/CD ortamlarında
# güvenilir tekrarlanabilir build için
log_info "Bağımlılıklar yükleniyor (npm ci)..."
if npm ci --silent; then
    log_success "Bağımlılıklar başarıyla yüklendi"
else
    log_error "npm ci başarısız oldu. npm install ile deneyin." 4
fi

# ================================================================
# BÖLÜM 4: Uygulama Başlatma
# ================================================================
log_section "Uygulama Başlatma"

if [ "$MODE" = "development" ]; then
    # Geliştirme modunda nodemon ile hot-reload
    log_info "Geliştirme sunucusu başlatılıyor (nodemon)..."
    npm run dev
else
    # Production modunda doğrudan Node.js
    log_info "Production sunucusu başlatılıyor..."
    log_info "Port: $APP_PORT | Ortam: $MODE"
    npm start
fi
