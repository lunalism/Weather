# RaceWeather — 레이싱 날씨 위성지도 TV 디스플레이

## 프로젝트 개요

레이싱 서킷의 실시간 날씨를 위성지도 기반 TV 디스플레이로 보여주는 사이트.
GMR Race Weekend Display와 동일한 배포 방식 (GitHub → Vercel 자동 배포).

---

## 핵심 스펙

### 기술 스택
- **Single `index.html`** — Pure HTML + Vanilla JS + CSS
- **지도**: Leaflet.js (CDN) + ESRI 위성 타일
- **날씨 API**: Open-Meteo (무료, API 키 불필요)
- **폰트**: Google Fonts — Orbitron (디스플레이), Share Tech Mono (데이터), Rajdhani (UI)
- **배포**: GitHub → Vercel (auto-deploy on push)

### 8개 서킷
| 서킷 | 위치 | 위도 | 경도 | 고도(m) |
|-------|------|------|------|---------|
| Imola | Italy | 44.3439 | 11.7167 | 47 |
| Spa-Francorchamps | Belgium | 50.4372 | 5.9714 | 401 |
| Le Mans | France | 47.9562 | 0.2075 | 62 |
| Interlagos | Brazil | -23.7036 | -46.6997 | 750 |
| COTA | USA | 30.1328 | -97.6411 | 163 |
| Fuji Speedway | Japan | 35.3725 | 138.9267 | 560 |
| Lusail (Qatar) | Qatar | 25.4900 | 51.4543 | 8 |
| Bahrain Int'l | Bahrain | 26.0325 | 50.5106 | 7 |

### 디자인
- **스타일**: 군사위성/HUD 레이더 느낌
- **컬러**: 다크 배경(`#020408`), 그린 HUD(`#00ff88`), 앰버 경고(`#ffaa00`), 레드 위험(`#ff3344`), 시안 정보(`#00ddff`)
- **효과**: 스캔라인 오버레이, 코너 브래킷, 글로우, 펄스 마커
- **TV 최적화**: 풀스크린, 커서 숨김, 큰 폰트

### 화면 구성
```
┌─────────────────────────────────────────────────────────┐
│ [LOGO] [🇮🇹 IMOLA] [🇧🇪 SPA] [🇫🇷 LE MANS] ... [LIVE] [CLOCK] │  ← 상단 탭 바
├────────┬────────────────────────────────┬───────────────┤
│        │                                │               │
│ 현재   │                                │  12H 강수     │
│ 기상   │      위성지도 (Leaflet)         │  예보 차트    │
│ 데이터 │      + 서킷 마커               │               │
│        │                                │  풍향/풍속    │
│        │                                │               │
├────────┴────────────────────────────────┴───────────────┤
│ [●] TRACK DRY — HIGH GRIP | TRACK 38°C | WIND 14km/h | │  ← 하단 상태 바
└─────────────────────────────────────────────────────────┘
```

### Open-Meteo API 호출
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &current=temperature_2m,relative_humidity_2m,apparent_temperature,
    precipitation,rain,weather_code,cloud_cover,surface_pressure,
    wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day
  &hourly=temperature_2m,precipitation_probability,weather_code,
    wind_speed_10m,wind_direction_10m
  &daily=sunrise,sunset,uv_index_max,temperature_2m_max,temperature_2m_min
  &forecast_days=1
  &timezone=auto
```

추가로 토양온도 (노면온도 근사):
```
  &hourly=soil_temperature_0cm
```

### 트랙 상태 판정 로직
- **DRY** (Green): 강수확률 < 20% AND 현재 강수량 = 0
- **DAMP** (Amber): 강수확률 20~60% OR 약한 강수
- **WET** (Red): 강수확률 > 60% OR 현재 비

### 그립 레벨 판정
- **HIGH**: DRY + 노면온도 20~50°C
- **MEDIUM**: DAMP 또는 노면온도 < 20°C 또는 > 50°C
- **LOW**: WET
- **VERY LOW**: WET + 강풍(> 40km/h)

---

## Claude Code 단계별 프롬프트

### STEP 1: 프로젝트 초기화 + 기본 구조

```
RaceWeather 프로젝트를 시작해줘.

1. 새 GitHub 리포지토리 `raceweather` 생성
2. 기본 `index.html` 파일 생성 — 풀스크린 레이아웃
3. Leaflet.js CDN + ESRI 위성 타일로 지도 표시
4. Google Fonts 로드 (Orbitron, Share Tech Mono, Rajdhani)
5. 8개 서킷 좌표 데이터를 JS 객체로 정의
6. 지도에 8개 서킷 마커 표시 (펄스 애니메이션)
7. Vercel 배포 확인

※ 아직 날씨 API 연동하지 말고, 지도 + 마커만 먼저.
※ 디자인 가이드: RACEWEATHER_GUIDE.md 참고
```

### STEP 2: 상단 탭 바 + 서킷 전환

```
STEP 2: 상단 탭 바를 구현해줘.

1. 상단에 고정 탭 바: RACEWEATHER 로고 + 8개 서킷 탭 (국기 포함) + LIVE 뱃지 + 실시간 시계
2. 탭 클릭 시 해당 서킷으로 map.flyTo() 애니메이션
3. 활성 탭 하이라이트 (그린 하단 라인 + 글로우)
4. 마커 클릭도 동일하게 동작
5. 스타일: 군사/HUD 느낌 — 다크 패널, 그린 텍스트, 스캔라인 오버레이

※ 커밋하기 전에 확인시켜줘.
```

### STEP 3: Open-Meteo API 연동

```
STEP 3: Open-Meteo API를 연동해줘.

1. 각 서킷별로 Open-Meteo API 호출 함수 구현
2. 필요한 데이터:
   - current: 기온, 체감온도, 습도, 기압, 강수, 구름, 풍속/풍향/돌풍, 날씨코드
   - hourly: 기온, 강수확률, 날씨코드, 풍속, 토양온도(0cm)
   - daily: 일출/일몰, UV 지수, 최고/최저 기온
3. 페이지 로드 시 8개 서킷 데이터 일괄 fetch
4. 10분마다 자동 갱신
5. 에러 핸들링 (네트워크 오류 시 마지막 데이터 유지)

※ 아직 UI 표시는 하지 말고, 콘솔에 데이터 확인만.
```

### STEP 4: 좌측 현재 기상 패널

```
STEP 4: 좌측 현재 기상 데이터 패널을 구현해줘.

1. 지도 좌측에 반투명 패널 오버레이
2. 표시 항목:
   - 서킷 이름 (국기 + 이름 + 풀네임)
   - 날씨 상태 텍스트 (weather_code → 텍스트 변환)
   - 대형 기온 표시 + 체감온도
   - 데이터 행: 노면온도(추정), 습도, 기압, 강수확률, 구름, 시정, UV, 이슬점, 일출/일몰
3. 값에 따라 색상 변경 (위험: 레드, 경고: 앰버, 정보: 시안)
4. 서킷 전환 시 데이터 업데이트
5. HUD 스타일: 코너 브래킷, 패널 라벨, 글로우

※ RACEWEATHER_GUIDE.md의 디자인 스펙 참고
```

### STEP 5: 우측 예보 + 풍향 패널

```
STEP 5: 우측 패널을 구현해줘.

1. 12시간 강수확률 바 차트
   - 현재 시각부터 12시간
   - 바 색상: 0~30% 그린, 30~60% 앰버, 60%+ 레드
   - 각 바 위에 퍼센트, 아래에 시간
2. 풍향 나침반
   - 원형 컴퍼스 + 방향 바늘 (풍향에 따라 회전)
   - 풍속, 돌풍, 방향, 뷰포트 스케일 표시
3. 서킷 전환 시 업데이트
```

### STEP 6: 하단 트랙 상태 바

```
STEP 6: 하단 트랙 상태 바를 구현해줘.

1. 화면 하단 고정 바
2. 트랙 상태 판정 (DRY/DAMP/WET) + 색상 인디케이터
3. 핵심 지표 한줄 요약: 노면온도, 풍속, 강수확률, 다음 비 예상, 시정
4. 우측에 좌표 + 고도 표시
5. 그립 레벨 판정 로직 적용

※ 판정 로직은 RACEWEATHER_GUIDE.md 참고
```

### STEP 7: 마무리 + 최적화

```
STEP 7: 최종 마무리해줘.

1. 스캔라인 오버레이 효과
2. 마커 호버 시 서킷 이름 툴팁
3. 데이터 로딩 중 표시 (HUD 스타일 "ACQUIRING DATA...")
4. 자동 갱신 시 "UPDATED" 피드백
5. TV 최적화: 커서 숨김, 풀스크린
6. 모바일 대응은 불필요 (TV 전용)
7. 최종 테스트 후 배포

※ 커밋 + 푸시 → Vercel 배포 확인
```

---

## 참고사항

- `git push`가 Vercel 자동 배포 트리거
- 네트워크 SSL 이슈 시: `NODE_TLS_REJECT_UNAUTHORIZED=0`
- GitHub 인증: `gh auth login`
- Open-Meteo는 API 키 불필요, CORS 지원
- Weather code → 텍스트 매핑은 WMO 표준 코드 사용
