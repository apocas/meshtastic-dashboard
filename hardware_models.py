# Hardware Model Mapping for Meshtastic Devices
# Based on the Meshtastic protobuf definitions
# This mapping converts hw_model numeric IDs to human-readable device names

HARDWARE_MODELS = {
    0: "UNSET",
    1: "TLORA_V2",
    2: "TLORA_V1", 
    3: "TLORA_V2_1_1p6",
    4: "TBEAM",
    5: "HELTEC_V2_0",
    6: "TBEAM0p7",
    7: "T_ECHO",
    8: "TLORA_V1_1p3",
    9: "RAK4631",
    10: "HELTEC_V2_1",
    11: "HELTEC_V1",
    12: "LILYGO_TBEAM_S3_CORE",
    13: "RAK11200",
    14: "NANO_G1",
    15: "TLORA_V2_1_1p8",
    16: "TLORA_T3_S3",
    17: "NANOPILOT_G1",
    18: "RAK11310",
    19: "SENSELORA_RP2040",
    20: "SENSELORA_S3",
    21: "CANARYONE",
    22: "RP2040_LORA",
    25: "STATION_G1",
    26: "RAK11200",
    27: "LORA_RELAY_V1",
    28: "NRF52840DK",
    29: "PCA10059",
    30: "HELTEC_V3",
    31: "RAK3172",
    32: "HELTEC_WSL_V3",
    33: "BETAFPV_2400_TX_MICRO",
    34: "BETAFPV_900_NANO_TX",
    35: "LORA_RELAY_V2",
    36: "LORA_TYPE",
    37: "WISBLOCK_4631",
    38: "RAK19003",
    39: "RAK19001",
    40: "SENSELORA_S3_MINI",
    41: "HELTEC_WIRELESS_TRACKER",
    42: "HELTEC_WIRELESS_PAPER",
    43: "T_ECHO",
    44: "ESP32_S3_PICO",
    45: "OAK_SERIES_1",
    46: "RADIOMASTER_900_BANDIT_NANO",
    47: "HELTEC_HT62",
    48: "UNPHONE",
    49: "TDECK",
    50: "PICOMPUTER_S3",
    51: "HELTEC_HT62_V1p6",
    52: "ESP32_C3_DIY_V1",
    53: "ESP32_S3_DIY_V1",
    54: "RADIOMASTER_900_BANDIT_PICO",
    55: "HELTEC_CAPSULE_SENSOR_V3",
    56: "HELTEC_VISION_MASTER_T190",
    57: "HELTEC_VISION_MASTER_E213",
    58: "HELTEC_VISION_MASTER_E290",
    59: "CHATTER_2",
    60: "RAK11310_USB",
    61: "STATION_G2",
}

# Vendor mapping based on device names
HARDWARE_VENDORS = {
    # LilyGO/TTGO devices
    "TLORA_V2": "LilyGO",
    "TLORA_V1": "LilyGO", 
    "TLORA_V2_1_1p6": "LilyGO",
    "TBEAM": "LilyGO",
    "TBEAM0p7": "LilyGO",
    "T_ECHO": "LilyGO",
    "TLORA_V1_1p3": "LilyGO",
    "TLORA_V2_1_1p8": "LilyGO",
    "TLORA_T3_S3": "LilyGO",
    "LILYGO_TBEAM_S3_CORE": "LilyGO",
    "TDECK": "LilyGO",
    
    # Heltec devices
    "HELTEC_V2_0": "Heltec",
    "HELTEC_V2_1": "Heltec",
    "HELTEC_V1": "Heltec",
    "HELTEC_V3": "Heltec",
    "HELTEC_WSL_V3": "Heltec",
    "HELTEC_WIRELESS_TRACKER": "Heltec",
    "HELTEC_WIRELESS_PAPER": "Heltec",
    "HELTEC_HT62": "Heltec",
    "HELTEC_HT62_V1p6": "Heltec",
    "HELTEC_CAPSULE_SENSOR_V3": "Heltec",
    "HELTEC_VISION_MASTER_T190": "Heltec",
    "HELTEC_VISION_MASTER_E213": "Heltec",
    "HELTEC_VISION_MASTER_E290": "Heltec",
    
    # RAK Wireless devices
    "RAK4631": "RAK Wireless",
    "RAK11200": "RAK Wireless",
    "RAK11310": "RAK Wireless",
    "RAK3172": "RAK Wireless",
    "RAK19003": "RAK Wireless",
    "RAK19001": "RAK Wireless",
    "RAK11310_USB": "RAK Wireless",
    "WISBLOCK_4631": "RAK Wireless",
    
    # SenseCAP devices
    "SENSELORA_RP2040": "SenseCAP",
    "SENSELORA_S3": "SenseCAP",
    "SENSELORA_S3_MINI": "SenseCAP",
    
    # Other vendors
    "NANO_G1": "Nano",
    "NANOPILOT_G1": "Nano",
    "CANARYONE": "Canary",
    "RP2040_LORA": "Generic",
    "STATION_G1": "Station",
    "STATION_G2": "Station",
    "LORA_RELAY_V1": "Generic",
    "LORA_RELAY_V2": "Generic",
    "NRF52840DK": "Nordic",
    "PCA10059": "Nordic",
    "BETAFPV_2400_TX_MICRO": "BetaFPV",
    "BETAFPV_900_NANO_TX": "BetaFPV",
    "ESP32_S3_PICO": "Generic",
    "OAK_SERIES_1": "Oak",
    "RADIOMASTER_900_BANDIT_NANO": "RadioMaster",
    "RADIOMASTER_900_BANDIT_PICO": "RadioMaster",
    "UNPHONE": "unPhone",
    "PICOMPUTER_S3": "PiComputer",
    "ESP32_C3_DIY_V1": "DIY",
    "ESP32_S3_DIY_V1": "DIY",
    "CHATTER_2": "Chatter",
    "LORA_TYPE": "Generic",
    "UNSET": "Unknown",
}

def get_hardware_model_name(hw_model_id):
    """
    Get the human-readable hardware model name from the numeric ID.
    
    Args:
        hw_model_id (int): The numeric hardware model ID
    
    Returns:
        str: Human-readable hardware model name or "Unknown" if not found
    """
    if hw_model_id is None:
        return "Unknown"
    
    return HARDWARE_MODELS.get(int(hw_model_id), f"Unknown ({hw_model_id})")

def get_hardware_vendor(hw_model_id):
    """
    Get the vendor name from the hardware model ID.
    
    Args:
        hw_model_id (int): The numeric hardware model ID
    
    Returns:
        str: Vendor name or "Unknown" if not found
    """
    if hw_model_id is None:
        return "Unknown"
    
    model_name = get_hardware_model_name(hw_model_id)
    return HARDWARE_VENDORS.get(model_name, "Unknown")

def get_hardware_info(hw_model_id):
    """
    Get complete hardware information including model name and vendor.
    
    Args:
        hw_model_id (int): The numeric hardware model ID
    
    Returns:
        dict: Dictionary containing model_name, vendor, and original_id
    """
    model_name = get_hardware_model_name(hw_model_id)
    vendor = get_hardware_vendor(hw_model_id)
    
    return {
        "model_name": model_name,
        "vendor": vendor,
        "original_id": hw_model_id
    }
