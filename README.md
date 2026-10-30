# ASTRO BUNNY

우주복 바니가 등장하는 픽셀 슈팅 게임. JavaScript, WebGL2와 Web Audio로 실행하며 에뮬레이터나 ROM 파일을 사용하지 않습니다.

**[웹에서 바로 플레이](https://hahyuck.github.io/astro-bunny/)**

- [레벨 2 BGM 미리듣기](https://hahyuck.github.io/astro-bunny/music-preview.html)
- [분신 보급 포효 미리보기](https://hahyuck.github.io/astro-bunny/effects-preview.html?scene=roar)
- [플레이·리소스 교체 안내](dist/README.txt)

## 조작

Enter 시작 / ← → 또는 A D 이동 / 자동 사격 / Z·X·Space 소드 / P 일시정지 / M 소리 / F 전체 화면.
터치 버튼과 게임패드도 지원합니다. 소리는 시작 버튼을 누르면 재생됩니다.

## 리소스 교체

게임 아래의 리소스 교체에서 캐릭터, 분신, 적, 배경, 보스, 타이틀, BGM, 효과음을 각각 바꿀 수 있습니다.
교체 파일은 현재 브라우저의 IndexedDB에만 저장됩니다. 로컬 주소에서 쓰던 팩은 내보낸 후 웹 주소에서 가져와 주세요.

## 로컬 실행과 검증

Python 3가 설치된 Windows에서는 `START.cmd`를 실행합니다. 다른 환경에서는:

```sh
python serve.py
```

Node.js 24 이상에서 별도 패키지 설치 없이 테스트할 수 있습니다.

```sh
npm test
```

## 배포

`main` 브랜치에 push하면 GitHub Actions가 테스트를 통과한 `dist/`를 GitHub Pages에 배포합니다.
다른 정적 호스팅에도 `dist/`의 내용을 그대로 올릴 수 있습니다. 모든 리소스는 상대 경로를 사용합니다.

실행 코드와 아트는 `dist/`, 회귀 검증은 `tests/`에 있습니다. 개인 PC 경로가 들어 있는 제작·검수 기록은 저장소에서 제외합니다.

Original ASTRO NINJA MAN © RIKI. 원작을 바탕으로 제작한 개인 리뉴얼 프로젝트이며, 기존 원작 표기를 유지합니다.
