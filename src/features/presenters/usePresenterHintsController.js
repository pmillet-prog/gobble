import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export default function usePresenterHintsController() {
  return useFeatureRuntime("presenters");
}
