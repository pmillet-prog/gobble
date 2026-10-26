import { useEffect } from "react";
import socket from "../../socket.js";
import { createMaintenanceRecovery } from "./createMaintenanceRecovery.js";

export default function MaintenanceRecoverySatellite() {
  useEffect(() => {
    const recovery = createMaintenanceRecovery({ socket });
    recovery.start();
    return () => recovery.dispose();
  }, []);
  return null;
}
