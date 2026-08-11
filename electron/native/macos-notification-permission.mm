#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

#include <node_api.h>
#include <string>

static const char *authorizationStatusName(UNAuthorizationStatus status) {
  switch (status) {
    case UNAuthorizationStatusNotDetermined:
      return "not-determined";
    case UNAuthorizationStatusDenied:
      return "denied";
    case UNAuthorizationStatusAuthorized:
      return "authorized";
    case UNAuthorizationStatusProvisional:
      return "provisional";
  }
  return "unknown";
}

static const char *notificationSettingName(UNNotificationSetting setting) {
  switch (setting) {
    case UNNotificationSettingNotSupported:
      return "not-supported";
    case UNNotificationSettingDisabled:
      return "disabled";
    case UNNotificationSettingEnabled:
      return "enabled";
  }
  return "unknown";
}

static bool setStringProperty(napi_env env,
                              napi_value object,
                              const char *name,
                              const char *value) {
  napi_value stringValue;
  return napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &stringValue) ==
             napi_ok &&
         napi_set_named_property(env, object, name, stringValue) == napi_ok;
}

struct NotificationSettingsWork {
  napi_async_work asyncWork = nullptr;
  napi_deferred deferred = nullptr;
  __strong UNNotificationSettings *settings = nil;
  std::string error;
};

static void executeGetNotificationSettings(napi_env env, void *data) {
  (void)env;
  NotificationSettingsWork *work =
      static_cast<NotificationSettingsWork *>(data);
  @autoreleasepool {
    __block UNNotificationSettings *settings = nil;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    [UNUserNotificationCenter.currentNotificationCenter
        getNotificationSettingsWithCompletionHandler:
            ^(UNNotificationSettings *nextSettings) {
              settings = nextSettings;
              dispatch_semaphore_signal(semaphore);
            }];

    dispatch_time_t timeout =
        dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC);
    if (dispatch_semaphore_wait(semaphore, timeout) != 0 || !settings) {
      work->error = "Timed out while reading notification permission";
      return;
    }
    work->settings = settings;
  }
}

static void rejectDeferred(napi_env env,
                           napi_deferred deferred,
                           const char *message) {
  napi_value errorMessage;
  napi_value error;
  if (napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &errorMessage) ==
          napi_ok &&
      napi_create_error(env, nullptr, errorMessage, &error) == napi_ok) {
    napi_reject_deferred(env, deferred, error);
  }
}

static void completeGetNotificationSettings(napi_env env,
                                            napi_status status,
                                            void *data) {
  NotificationSettingsWork *work =
      static_cast<NotificationSettingsWork *>(data);
  @autoreleasepool {
    if (status != napi_ok) {
      rejectDeferred(env, work->deferred,
                     "Unable to complete notification permission query");
    } else if (!work->error.empty()) {
      rejectDeferred(env, work->deferred, work->error.c_str());
    } else if (!work->settings) {
      rejectDeferred(env, work->deferred,
                     "Notification permission settings are unavailable");
    } else {
      napi_value result;
      const char *bundleIdentifier =
          NSBundle.mainBundle.bundleIdentifier.UTF8String ?: "";
      if (napi_create_object(env, &result) != napi_ok ||
          !setStringProperty(env, result, "bundleIdentifier",
                             bundleIdentifier) ||
          !setStringProperty(
              env, result, "authorizationStatus",
              authorizationStatusName(work->settings.authorizationStatus)) ||
          !setStringProperty(
              env, result, "alertSetting",
              notificationSettingName(work->settings.alertSetting)) ||
          !setStringProperty(
              env, result, "notificationCenterSetting",
              notificationSettingName(
                  work->settings.notificationCenterSetting)) ||
          !setStringProperty(
              env, result, "soundSetting",
              notificationSettingName(work->settings.soundSetting))) {
        rejectDeferred(env, work->deferred,
                       "Unable to create notification permission result");
      } else {
        napi_resolve_deferred(env, work->deferred, result);
      }
    }
  }

  napi_delete_async_work(env, work->asyncWork);
  delete work;
}

static napi_value getNotificationSettings(napi_env env,
                                          napi_callback_info info) {
  size_t argumentCount = 0;
  if (napi_get_cb_info(env, info, &argumentCount, nullptr, nullptr, nullptr) !=
          napi_ok ||
      argumentCount != 0) {
    napi_throw_type_error(env, nullptr, "Expected no arguments");
    return nullptr;
  }

  NotificationSettingsWork *work = new NotificationSettingsWork();
  napi_value promise;
  napi_value resourceName;
  if (napi_create_promise(env, &work->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "getNotificationSettings", NAPI_AUTO_LENGTH,
                              &resourceName) != napi_ok ||
      napi_create_async_work(env, nullptr, resourceName,
                             executeGetNotificationSettings,
                             completeGetNotificationSettings, work,
                             &work->asyncWork) != napi_ok) {
    delete work;
    napi_throw_error(env, nullptr,
                     "Unable to create notification permission query");
    return nullptr;
  }
  if (napi_queue_async_work(env, work->asyncWork) != napi_ok) {
    napi_delete_async_work(env, work->asyncWork);
    delete work;
    napi_throw_error(env, nullptr,
                     "Unable to queue notification permission query");
    return nullptr;
  }
  return promise;
}

NAPI_MODULE_INIT() {
  napi_value function;
  if (napi_create_function(env, "getNotificationSettings", NAPI_AUTO_LENGTH,
                           getNotificationSettings, nullptr, &function) !=
          napi_ok ||
      napi_set_named_property(env, exports, "getNotificationSettings",
                              function) != napi_ok) {
    napi_throw_error(env, nullptr,
                     "Unable to initialize notification permission module");
    return nullptr;
  }
  return exports;
}
