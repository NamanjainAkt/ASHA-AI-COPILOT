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



