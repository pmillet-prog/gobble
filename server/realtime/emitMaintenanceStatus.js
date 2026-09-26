export function emitMaintenanceStatus(target, maintenanceMode) {
  const payload = {
    maintenanceMode: !!maintenanceMode,
    maintenanceMessage: maintenanceMode ? "Maintenance en cours" : "",
  };
  target.emit("maintenanceStatus", payload);
  target.emit("chalkboardAvailability", { maintenanceMode: payload.maintenanceMode });
}
