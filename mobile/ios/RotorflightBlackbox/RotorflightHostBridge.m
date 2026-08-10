#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RotorflightHost, NSObject)

RCT_EXTERN_METHOD(openViewer:(BOOL)pickImmediately
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
