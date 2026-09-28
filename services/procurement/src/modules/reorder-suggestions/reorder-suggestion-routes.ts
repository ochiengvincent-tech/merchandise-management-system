import { Router } from "express";
import { methodNotAllowed } from "../../middleware/method-not-allowed.js";
import {
  convertReorderSuggestionController,
  dismissReorderSuggestionController,
  listReorderSuggestionsController,
} from "./reorder-suggestion-controller.js";

const router: Router = Router();

router.get("/", listReorderSuggestionsController);
router.all("/", methodNotAllowed);

router.patch("/:id/convert", convertReorderSuggestionController);
router.all("/:id/convert", methodNotAllowed);

router.patch("/:id/dismiss", dismissReorderSuggestionController);
router.all("/:id/dismiss", methodNotAllowed);

export default router;
