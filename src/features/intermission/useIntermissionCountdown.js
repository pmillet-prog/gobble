import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

export function useIntermissionCountdown() {
  const clock = useFeatureRuntime("intermission");
  return useFeatureSelector(clock, (state) => state.remainingSeconds);
}
