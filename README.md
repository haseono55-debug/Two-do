# 💕 Two-Do 설치 가이드

둘이 함께 채우는 커플 버킷리스트야. 아래 순서대로 한 번만 설정하면 아이폰·갤럭시 둘 다 앱처럼 쓸 수 있어!

> 💻 **설정은 컴퓨터에서 하는 걸 추천해.** 다 끝나면 휴대폰에서는 주소만 열면 돼.
> 필요한 것: 무료 계정 3개 (Supabase · GitHub · Vercel) + 메일 보낼 Gmail 1개

---

## 1단계. Supabase 프로젝트 만들기 🗄️
1. https://supabase.com 가입 → **New project**
2. 이름 `two-do`, 비밀번호 아무거나(기억해두기), Region은 **Northeast Asia (Seoul)**
3. 1~2분 기다리면 완성

## 2단계. 데이터베이스 설정 🔒
1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 이 폴더의 `supabase/schema.sql` 내용을 **전부 복사해서 붙여넣기** → **Run**
3. `Success`가 뜨면 끝! (테이블, 보안 규칙, 사진 저장소, 실시간 동기화가 한 번에 설정돼)

## 3단계. 이메일 확인 끄기 ✉️ (스위치 하나!)
로그인은 **이메일 + 비밀번호** 방식이라 메일을 보낼 필요가 없어.

1. Supabase → **Authentication → Sign In / Providers → Email**
2. **Confirm email** 스위치를 **끄기** → **Save**

## 4단계. (없음) 🎉
메일 설정이 필요 없어서 이 단계는 건너뛰면 돼!

## 5단계. GitHub에 올리기 📦
1. https://github.com 가입 → 오른쪽 위 **＋ → New repository** → 이름 `two-do`, **Private** 선택 → Create
2. **uploading an existing file** 클릭 → 이 폴더 안의 파일·폴더를 **전부 끌어다 놓기** → **Commit changes**

## 6단계. 키 넣기 🔑
1. Supabase → **Project Settings → API Keys**
   - **Project URL** (예: `https://abcd.supabase.co`) — Data API 메뉴나 프로젝트 홈에서 보여
   - **Publishable key** (`sb_publishable_...`) 또는 **anon public** 키
2. GitHub의 `config.js` 파일 → ✏️ 연필 버튼 → 두 값을 바꿔 넣고 **Commit changes**
   > 이 두 값은 원래 공개되는 값이라 괜찮아. **service_role / secret 키는 절대 넣지 마!** ⚠️

## 7단계. Vercel로 배포하기 🚀
1. https://vercel.com → **Continue with GitHub**
2. **Add New → Project** → `two-do` 저장소 **Import**
3. Framework Preset은 **Other** 그대로 → **Deploy**
4. 완성된 주소(예: `https://two-do-xxx.vercel.app`)가 우리 커플 주소야 🎉
5. (선택) Supabase → **Authentication → URL Configuration → Site URL** 에 이 주소 넣기

## 8단계. 휴대폰에서 시작하기 📱
1. **먼저 홈 화면에 추가** (로그인은 앱 안에서 해줘!)
   - 🍎 아이폰: Safari로 주소 열기 → 공유 버튼 ⬆️ → **홈 화면에 추가**
   - 🤖 갤럭시: 삼성 인터넷 메뉴 ≡ → **현재 페이지 추가 → 홈 화면** / Chrome ⋮ → **홈 화면에 추가**
2. 홈 화면의 Two-Do 아이콘으로 열기 → **처음이야 (가입)** → 이메일·비밀번호 입력
3. 닉네임·하트 고르고 **✨ 새 공간 만들기**
4. 홈에 뜨는 **초대 코드**를 짝꿍에게 보내기 💌
5. 짝꿍도 1~2번 하고 **💌 초대 코드로 연결하기** → 연결 완료 💞

---

## 💡 알아두면 좋은 것
- **무료 범위**: 사진은 자동 압축(장당 약 300KB)돼서 무료 1GB에 약 3천 장 들어가
- **일주일 넘게 아무도 안 쓰면** Supabase 무료 프로젝트가 일시정지돼. 대시보드에서 **Restore** 누르면 데이터 그대로 돌아와
- **연말 결산**은 12월에 홈과 앨범에 나타나. 미리 보고 싶으면 주소 뒤에 `?recap=1` 을 붙여봐
- **코드 수정 후 배포**할 땐 `sw.js` 맨 위 `twodo-v1` 숫자를 하나 올려줘 (안 그러면 예전 화면이 남아 있을 수 있어)
- **백업**: 우리 공간 → 데이터 내보내기
- **비밀번호를 잊었을 때** 🔐: Supabase **SQL Editor**에서 아래를 실행하면 새 비밀번호로 바뀌어 (이메일·비밀번호만 바꿔서)
  ```sql
  update auth.users set encrypted_password = crypt('새비밀번호', gen_salt('bf'))
  where email = '내이메일@gmail.com';
  ```
- 무료 정책은 바뀔 수 있으니 가끔 Supabase·Vercel 요금 페이지를 확인해줘

## 📁 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 앱 화면 틀 |
| `app.js` | 모든 기능 |
| `styles.css` | 파스텔 클라우드 디자인 |
| `config.js` | Supabase 주소·키 (6단계) |
| `manifest.webmanifest`, `sw.js`, `icons/` | 홈 화면 앱 설정 |
| `supabase/schema.sql` | 데이터베이스·보안 규칙 (2단계) |
