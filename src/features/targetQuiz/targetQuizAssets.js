import { RELEASE_SCOPE } from "../../../shared/releaseScope.js";
export const TARGET_QUIZ_PREVIEW_LOGO_SRC = "/bots/foucault/gobblars-logo-v1.webp";
export const TARGET_QUIZ_LOGO_SRC = RELEASE_SCOPE.targetQuizBranding
  ? TARGET_QUIZ_PREVIEW_LOGO_SRC : "/bots/foucault/millions-logo.png";
