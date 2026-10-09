cmake_minimum_required(VERSION 3.10)
project(asha_native CXX)

# Native engines ship arm64 only; other ABIs skip these targets so the
# release APK keeps working everywhere with an honest NOT_SUPPORTED fallback.
if(NOT ANDROID_ABI STREQUAL "arm64-v8a")
    message(STATUS "asha_native: skipping whisper/needle for ${ANDROID_ABI}")
    return()
endif()

add_library(needle_jni SHARED needle_jni.cpp)

set_target_properties(needle_jni PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

target_include_directories(needle_jni PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

add_library(needle STATIC IMPORTED)
set_target_properties(needle PROPERTIES
    IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/arm64-v8a-libneedle.a
)

target_link_libraries(needle_jni PRIVATE needle log)
# libneedle.a references stderr (resolved from libc at runtime, as in previous
# shipped builds); do not fail the link on it.
target_link_options(needle_jni PRIVATE "LINKER:-z,undefs")

# ---- whisper.cpp (offline Hindi STT) ----
# Locate third-party/whispercpp by walking up (depth-independent).
set(_SEARCH_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
set(WHISPER_CPP_DIR "")
while(NOT WHISPER_CPP_DIR)
    if(EXISTS "${_SEARCH_DIR}/third-party/whispercpp/ggml/CMakeLists.txt")
        set(WHISPER_CPP_DIR "${_SEARCH_DIR}/third-party/whispercpp")
    endif()
    get_filename_component(_PARENT "${_SEARCH_DIR}" DIRECTORY)
    if(_PARENT STREQUAL _SEARCH_DIR)
        break()
    endif()
    set(_SEARCH_DIR "${_PARENT}")
endwhile()
if(WHISPER_CPP_DIR STREQUAL "")
    message(FATAL_ERROR "whisper.cpp not found under any parent of ${CMAKE_CURRENT_SOURCE_DIR}")
endif()
message(STATUS "whisper.cpp at ${WHISPER_CPP_DIR}")

add_library(whisper_asha SHARED whisper_jni.cpp)

set_target_properties(whisper_asha PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

target_sources(whisper_asha PRIVATE
    "${WHISPER_CPP_DIR}/src/whisper.cpp"
    "${WHISPER_CPP_DIR}/src/aneforge/whisper-aneforge.cpp"
)

target_include_directories(whisper_asha PRIVATE
    "${WHISPER_CPP_DIR}/include"
    "${WHISPER_CPP_DIR}/src"
    "${WHISPER_CPP_DIR}/ggml/include"
    "${WHISPER_CPP_DIR}/ggml/src"
)

target_compile_definitions(whisper_asha PRIVATE GGML_USE_CPU)
target_compile_definitions(whisper_asha PRIVATE WHISPER_VERSION="asha-1.0")
target_compile_options(whisper_asha PRIVATE -O3)

set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
add_subdirectory("${WHISPER_CPP_DIR}/ggml" ggml_build)

find_library(LOG_LIB log)
target_link_libraries(whisper_asha PRIVATE ${LOG_LIB} android ggml)
