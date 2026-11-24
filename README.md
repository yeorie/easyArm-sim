# easyArm-sim

직렬 회전관절 로봇팔의 정기구학을 조작하며 설계 변경과 도달 범위를 확인하는 한국어 3D 앱입니다.

**[브라우저에서 easyArm-sim 실행](https://yeorie.github.io/easyArm-sim/)** · [배포 이력](https://github.com/yeorie/easyArm-sim/actions/workflows/pages.yml)

웹 버전은 설치와 계정 없이 WebGL2를 지원하는 브라우저에서 실행됩니다. 오른쪽 슬라이더로 관절을 돌리거나, 왼쪽 **예제 불러오기**에서 UR5e를 선택할 수 있습니다.

## 로컬 실행

Node.js 24 이상이 설치된 환경에서 실행합니다.

```sh
git clone https://github.com/yeorie/easyArm-sim.git
cd easyArm-sim
npm ci
npm run dev
```

터미널에 표시되는 `Local` 주소를 브라우저로 엽니다. Windows PowerShell에서 npm 실행이 제한되면 위 명령의 `npm` 대신 `npm.cmd`를 사용합니다.

## 테스트와 배포

```sh
npm test
npm run build
npm run preview
```

`main`에 푸시하면 GitHub Actions가 테스트 후 정적 빌드 결과인 `dist/`를 GitHub Pages에 배포합니다. 로컬 배포본의 기본 미리보기 주소는 `http://localhost:4173/easyArm-sim/`입니다.

## 축과 단위

- 베이스 좌표계는 오른손 Z-up이며 X는 빨강, Y는 초록, Z는 파랑입니다. 거리는 mm, 각도는 °입니다. 범용 모델의 첫 관절은 베이스 원점에 있고, UR5e의 첫 관절은 베이스에서 162.5 mm 위에 있습니다.
- 각 관절 원점에서 지정한 로컬 축의 양의 방향을 기준으로 오른손 법칙에 따라 회전합니다. 회전한 좌표계에서 링크 길이를 선택한 로컬 양의 축으로, 측면 오프셋을 별도의 직교축으로 적용합니다. 길이 방향이 +Y이면 오프셋은 로컬 X, 그 외에는 로컬 Y입니다. 음수 오프셋은 반대 방향입니다.
- 마지막 링크는 마지막 관절에서 플랜지까지의 변위입니다. 플랜지에서 마지막 관절의 로컬 +Z로 공구 길이를 한 번 적용합니다.
- 관절 삭제 시 그 관절의 링크도 함께 제거됩니다. 다른 관절의 설정과 순서는 유지됩니다. 입력값은 Enter로 확정하거나 입력 칸에서 벗어나면 적용됩니다.

## 관절 조작과 예제

- 검정 기준선은 부모 쪽 0° 위치, 노랑 표시는 회전축과 함께 도는 위치입니다. **관절 0°**는 모든 축을 0°로 보냅니다. UR5e의 **수직 기준 자세**는 앱이 정의한 `[0, -90, 0, 0, 90, 0]°`이며 상완과 전완을 위로 세웁니다.
- C자 공구는 닫힌 쪽을 플랜지 쪽에 장착하고, 열린 쪽이 공구의 로컬 +Z 방향으로 향하는 표시용 형상입니다. 좌표와 작업공간 계산에는 공구 길이 입력이 적용됩니다.
- 마우스 모드에서 **시점 고정**은 마우스로 하는 시점 조작을 막습니다. **드래그 조그**에서는 관절을 끌어 해당 축을 돌리거나 TCP·공구를 끌어 선택 축을 돌립니다. 드래그 결과는 각도 입력과 TCP에 바로 반영됩니다.
- **예제 불러오기 → Universal Robots UR5e**는 ROS `base_link` 기준의 공칭 관절 원점, 회전축, `tool0` 변환과 공식 외형 메시 7개를 적용합니다. UR5e와 사용자 팔을 전환해도 각 모델의 현재 자세와 공구 길이가 보존됩니다.
- **UR5e 관절 범위**는 [PolyScope 5.26](https://www.universal-robots.com/manuals/EN/PDF/SW5_26/user-manual-UR5e-PDF_online/710-965-00_UR5e_User_Manual_en_Global.pdf)의 J3 ±160°와 나머지 축 ±360°를 기본으로 사용합니다. [PolyScope X 10.15](https://www.universal-robots.com/manuals/EN/PDF/SW10_15/user-manual-UR5e-PolyX-PDF_online/718-732-00_UR5e_User_Manual_PolyScopeX_en_Global.pdf)의 전 축 ±360°도 선택할 수 있습니다. 이 범위는 시뮬레이터의 입력 한계입니다.
- 범용 팔에서는 측면 오프셋 구간을 먼저 그린 다음 선택한 길이 방향으로 꺾습니다. 관절 원점, 링크 끝점과 TCP가 동일한 기구학을 따릅니다.

UR5e 출처는 [Universal Robots ROS 2 Description의 고정 커밋](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description/tree/0eb1a861f7772fceb38510d90fa2f98ec668070c)입니다. `config/ur5e/default_kinematics.yaml`, `config/ur5e/joint_limits.yaml`, `urdf/ur_macro.xacro`, `config/ur5e/visual_parameters.yaml` 및 `meshes/ur5e/visual/`의 원본 메시를 사용했습니다. [원본 BSD-3-Clause 라이선스](public/licenses/ur-description-BSD-3-Clause.txt)를 배포에 포함합니다.

## 작업공간과 자세

- **자세 진단**은 자코비안으로 TCP 위치와 위치+방향의 순간 자유도를 각각 표시합니다. 모델 기준 랭크는 관절 범위 안의 자세에서 추정합니다. 선속도는 도달 반경 상한으로 정규화하며, 기준 랭크의 최소 특잇값이 최대 특잇값의 4% 미만이면 근접, 기준보다 랭크가 낮으면 특이점으로 표시합니다. 관절 조그와 MoveJ는 관절 한계 안에서 계속 사용할 수 있습니다.
- 관절 한계 도달·근접·고정 표시는 특이점과 별도입니다. 한계에서 5° 이내이면 근접으로 표시합니다. 설치별 안전 범위와 충돌 가능성은 실기 설정과 별도로 검증해야 합니다.

- 정반 격자는 XY 간격 25 mm, 큰 눈금 간격 100 mm이며, 베이스 기준 Z = -62 mm에 놓입니다. XY를 입력하거나 정반을 더블클릭해 목표를 놓습니다. 목표 높이는 정반 위 거리입니다. 현재 TCP와 목표 거리, 가장 가까운 TCP 표본과 목표 거리를 확인할 수 있습니다.
- 하늘색 점군은 관절 한계 내에서 고정된 난수 순서로 뽑은 4,096개 자세의 TCP입니다. 조그 중에는 기존 점군을 재사용합니다. 높이 단면은 목표 Z의 ±25 mm 범위에 들어온 표본을 목표 높이에 투영합니다. 점이 드문 영역의 도달 여부는 이 표본만으로 판단할 수 없습니다.
- 격자 구는 첫 관절을 중심으로 각 링크 변위의 크기와 공구 길이를 더한 거리 상한입니다. 기본 화면에서는 끈 상태로 시작하며 작업공간에서 켤 수 있습니다.
- 저장 자세는 관절각과 관절 구성 식별값을 함께 보관합니다. 동일한 관절 구성에서 링크와 공구 길이를 수정한 뒤에도 사용할 수 있습니다. MoveJ는 공통 시간 비율로 각 축을 보간합니다.
- 팔 설정, 현재 각도, 목표 위치, 표시 설정과 저장 자세는 브라우저의 `localStorage`에 `easyArm-sim:v1` 키로 저장됩니다. 브라우저 프로필과 사이트 주소별로 저장됩니다.

## 데이터와 라이선스

앱은 브라우저에서 계산합니다. UR5e 외형도 사이트와 함께 제공하며, 자세나 설정을 서버에 전송하는 기능은 없습니다.

- three.js는 [MIT 라이선스](public/licenses/three-MIT.txt)를 따릅니다.
- UR5e의 기구학 데이터와 외형에는 [Universal Robots의 BSD-3-Clause 라이선스](public/licenses/ur-description-BSD-3-Clause.txt)가 적용됩니다.
- easyArm-sim 자체 소스의 재배포 라이선스는 미지정입니다.

## 브라우저 검증

Microsoft Edge가 설치된 PC에서 빌드한 뒤, `npm run preview`로 미리보기를 켜고 별도 터미널에서 `npm run test:browser`를 실행합니다. 기본 검증 주소는 `http://127.0.0.1:4173/easyArm-sim/`입니다. 다른 배포 주소는 `EASYARM_URL` 환경변수로 지정할 수 있습니다.
