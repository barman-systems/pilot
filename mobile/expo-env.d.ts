/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_DABBIR_API_BASE_URL?: string;
    EXPO_PUBLIC_IOS_IAP_ENABLED?: string;
    EXPO_PUBLIC_IOS_SUBSCRIPTION_PRODUCT_ID?: string;
  }
}
