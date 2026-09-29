#!/usr/bin/env bash
# Builds OpenCV.js with the contrib `face` module (Facemark LBF) for bench arm A, then
# downloads the models it needs. Output lands in static/opencv/ (gitignored), sources and
# build cache in facialID-test/.opencv-build/.
#
# Needs docker. First run clones ~1 GB of sources and takes a while; re-runs reuse them.
#   OPENCV_VERSION  git tag of opencv + opencv_contrib (default 4.10.0)
#   EMSDK_VERSION   emscripten/emsdk docker tag (default 2.0.10, per OpenCV's JS docs)
#   OPENCV_SIMD=1   build with wasm SIMD (no cross-origin isolation needed, unlike threads)
set -euo pipefail

OPENCV_VERSION="${OPENCV_VERSION:-4.10.0}"
EMSDK_VERSION="${EMSDK_VERSION:-2.0.10}"
TEST_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$TEST_DIR/.." && pwd)"
WORK="$TEST_DIR/.opencv-build"
OUT="$REPO/static/opencv"

mkdir -p "$WORK" "$OUT"
cd "$WORK"

for repo in opencv opencv_contrib; do
	[ -d "$repo" ] || git clone --depth 1 --branch "$OPENCV_VERSION" "https://github.com/opencv/$repo.git"
done

# Upstream only wraps `face` for python/java/objc; add js so embindgen scans its headers.
sed -i 's/^\(\s*WRAP python java objc\)$/\1 js/' opencv_contrib/modules/face/CMakeLists.txt
grep -q 'WRAP python java objc js' opencv_contrib/modules/face/CMakeLists.txt

# Upstream whitelist + the Facemark entry points. The generator turns the Ptr-returning
# factory into the class constructor, so JS uses `new cv.face_Facemark()` (an LBF instance).
cp opencv/platforms/js/opencv_js.config.py opencv_js.face.config.py
cat >>opencv_js.face.config.py <<'EOF'

face = {'': ['createFacemarkLBF'], 'face_Facemark': ['fit', 'loadModel']}
white_list = makeWhiteList([core, imgproc, objdetect, video, dnn, features2d, photo, calib3d, face])
namespace_prefix_override['face'] = ''
EOF

# embindgen looks up a factory's Ptr<T> return type without its namespace, so Ptr<Facemark>
# misses the class it registered as `face_Facemark`. Retry the lookup with the prefix.
python3 - opencv/modules/js/generator/embindgen.py <<'EOF'
import sys
path = sys.argv[1]
src = open(path).read()
anchor = '                        self.classes[base_class_name].has_smart_ptr = True\n'
fix = (
    "                        if base_class_name not in self.classes and ns_id + '_' + base_class_name in self.classes:\n"
    "                            base_class_name = ns_id + '_' + base_class_name\n"
)
if fix not in src:
    assert anchor in src, 'embindgen.py changed upstream; revisit this patch'
    src = src.replace(anchor, fix + anchor, 1)

# face::Facemark derives *virtually* from Algorithm, which embind's base<> cannot cast
# through. Nothing we call lives on Algorithm, so drop the base for face classes.
anchor = '            if len(class_info.bases) == 1:\n'
fix = "            if len(class_info.bases) == 1 and not class_info.cname.startswith('cv::face::'):\n"
if fix not in src:
    assert anchor in src, 'embindgen.py changed upstream; revisit this patch'
    src = src.replace(anchor, fix, 1)
open(path, 'w').write(src)
EOF

# The generated bindings name face types unqualified; upstream does the same for dnn/aruco
# with using-directives in the bindings template.
grep -q 'using namespace cv::face' opencv/modules/js/src/core_bindings.cpp ||
	sed -i 's|^using namespace cv::dnn;$|&\n#endif\n\n#ifdef HAVE_OPENCV_FACE\nusing namespace cv::face;|' \
		opencv/modules/js/src/core_bindings.cpp
grep -q 'using namespace cv::face' opencv/modules/js/src/core_bindings.cpp

build_flags=(--build_wasm)
[ "${OPENCV_SIMD:-0}" = 1 ] && build_flags+=(--simd)

docker run --rm -v "$WORK:/src" -u "$(id -u):$(id -g)" "emscripten/emsdk:$EMSDK_VERSION" \
	emcmake python3 ./opencv/platforms/js/build_js.py build_js "${build_flags[@]}" \
	--config /src/opencv_js.face.config.py \
	--cmake_option=-DOPENCV_EXTRA_MODULES_PATH=/src/opencv_contrib/modules/face

cp build_js/bin/opencv.js "$OUT/opencv.js"

fetch() {
	[ -s "$OUT/$1" ] || curl -fL --retry 3 -o "$OUT/$1" "$2"
}
fetch haarcascade_frontalface_default.xml \
	"https://raw.githubusercontent.com/opencv/opencv/$OPENCV_VERSION/data/haarcascades/haarcascade_frontalface_default.xml"
fetch lbfmodel.yaml \
	'https://raw.githubusercontent.com/kurnianggoro/GSOC2017/master/data/lbfmodel.yaml'

ls -lh "$OUT"
