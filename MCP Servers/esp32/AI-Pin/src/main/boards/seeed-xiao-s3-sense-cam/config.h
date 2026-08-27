#ifndef _BOARD_CONFIG_H_
#define _BOARD_CONFIG_H_

#include <driver/gpio.h>

// Seeed Studio XIAO ESP32S3 Sense (camera + PDM mic expansion board)
// No display. Confirmed on real hardware: ESP32-S3, 8MB embedded PSRAM
// (Octal), native USB-Serial/JTAG on COM8, MAC 68:ee:8f:4f:51:dc.

#define AUDIO_INPUT_SAMPLE_RATE  16000
#define AUDIO_OUTPUT_SAMPLE_RATE 24000

// Onboard PDM digital microphone on the Sense expansion board
// (Seeed XIAO ESP32S3 Sense: MIC CLK = GPIO42, MIC DATA = GPIO41)
#define AUDIO_I2S_MIC_GPIO_SCK  GPIO_NUM_42
#define AUDIO_I2S_MIC_GPIO_DIN  GPIO_NUM_41

// External MAX98357A I2S Class-D amp on the AI-Pin carrier board.
// This mapping was mis-derived from a compressed schematic render
// (GPIO5/6/8) on this board profile before being corrected here. The
// mapping below was independently verified TWICE on this same AI-Pin
// carrier-board design in an earlier debugging session (project memory:
// xiaozhi-server-deployment.md, items 9-10): once by physical multimeter
// continuity from the amp's pads to the XIAO's D-pins (cross-checked
// against the official Seeed pinout diagram), and once by re-reading the
// schematic PDF at high zoom (pixel-level pin-to-net trace) - both agree:
//   BCLK -> XIAO D6 = GPIO43, LRC -> XIAO D4 = GPIO5, DIN -> XIAO D8 = GPIO7
// IMPORTANT: GPIO43 is also the chip's default UART0 TX pin. The console
// MUST be on USB Serial/JTAG (not UART0) or simultaneous log traffic
// corrupts the BCLK waveform and audio stays silent even with correct
// pins - see sdkconfig CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG in config.json.
// GAIN and SD are fixed by the board's hardware (SD floating/NC = enabled
// per MAX98357A default, GAIN tied to GND via R1) - no GPIO needed.
#define AUDIO_I2S_SPK_GPIO_LRCK GPIO_NUM_5
#define AUDIO_I2S_SPK_GPIO_BCLK GPIO_NUM_43
#define AUDIO_I2S_SPK_GPIO_DOUT GPIO_NUM_7

#define BUILTIN_LED_GPIO        GPIO_NUM_21
#define BOOT_BUTTON_GPIO        GPIO_NUM_0
#define TOUCH_BUTTON_GPIO       GPIO_NUM_NC
#define VOLUME_UP_BUTTON_GPIO   GPIO_NUM_NC
#define VOLUME_DOWN_BUTTON_GPIO GPIO_NUM_NC
#define RESET_NVS_BUTTON_GPIO     GPIO_NUM_NC
#define RESET_FACTORY_BUTTON_GPIO GPIO_NUM_NC

// Camera pins - Seeed XIAO ESP32S3 Sense onboard OV2640 (fixed hardware
// wiring, matches Seeed's official CAMERA_MODEL_XIAO_ESP32S3 pinout).
#define PWDN_GPIO_NUM       GPIO_NUM_NC
#define RESET_GPIO_NUM      GPIO_NUM_NC
#define XCLK_GPIO_NUM       GPIO_NUM_10
#define Y9_GPIO_NUM         GPIO_NUM_48
#define Y8_GPIO_NUM         GPIO_NUM_11
#define Y7_GPIO_NUM         GPIO_NUM_12
#define Y6_GPIO_NUM         GPIO_NUM_14
#define Y5_GPIO_NUM         GPIO_NUM_16
#define Y4_GPIO_NUM         GPIO_NUM_18
#define Y3_GPIO_NUM         GPIO_NUM_17
#define Y2_GPIO_NUM         GPIO_NUM_15
#define VSYNC_GPIO_NUM      GPIO_NUM_38
#define HREF_GPIO_NUM       GPIO_NUM_47
#define PCLK_GPIO_NUM       GPIO_NUM_13
#define SIOD_GPIO_NUM       GPIO_NUM_40
#define SIOC_GPIO_NUM       GPIO_NUM_39

/* Camera pins (Xiaozhi naming) */
#define CAMERA_PIN_PWDN     PWDN_GPIO_NUM
#define CAMERA_PIN_RESET    RESET_GPIO_NUM
#define CAMERA_PIN_XCLK     XCLK_GPIO_NUM
#define CAMERA_PIN_SIOD     SIOD_GPIO_NUM
#define CAMERA_PIN_SIOC     SIOC_GPIO_NUM

#define CAMERA_PIN_D7       Y9_GPIO_NUM
#define CAMERA_PIN_D6       Y8_GPIO_NUM
#define CAMERA_PIN_D5       Y7_GPIO_NUM
#define CAMERA_PIN_D4       Y6_GPIO_NUM
#define CAMERA_PIN_D3       Y5_GPIO_NUM
#define CAMERA_PIN_D2       Y4_GPIO_NUM
#define CAMERA_PIN_D1       Y3_GPIO_NUM
#define CAMERA_PIN_D0       Y2_GPIO_NUM
#define CAMERA_PIN_VSYNC    VSYNC_GPIO_NUM
#define CAMERA_PIN_HREF     HREF_GPIO_NUM
#define CAMERA_PIN_PCLK     PCLK_GPIO_NUM

#define XCLK_FREQ_HZ 20000000

#endif  // _BOARD_CONFIG_H_
