export { default as ComponentTracker } from "./componentTracker";
export { default as InteractionTracker } from "./interactionTracker";
import predictionModelInstance from "./predictionModel";
import ComponentPreload from './componentPreload';

ComponentPreload.getInstance();

predictionModelInstance;