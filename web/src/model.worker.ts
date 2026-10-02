import { buildModel, Model } from "./lib/analysis";
import { Cohort } from "./lib/cohort";

type WorkerScope = {
  onmessage: (event: MessageEvent<Cohort>) => void;
  postMessage: (model: Model) => void;
};

const scope = self as unknown as WorkerScope;
scope.onmessage = (event) => {
  scope.postMessage(buildModel(event.data));
};
