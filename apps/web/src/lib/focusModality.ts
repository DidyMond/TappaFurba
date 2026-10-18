/**
 * Da dove arriva il focus: tastiera o puntatore (mouse/tap)? `:focus-visible` nei campi di testo scatta SEMPRE (anche da
 * click), quindi non basta per mostrare l'anello «solo da tastiera»: si ricorda l'ultima interazione. Si registra in un'unica esecuzione, in cattura, sul documento.
 */
let lastInteractionWasKeyboard = false;
let installed = false;

function install(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const keyboard = () => {
    lastInteractionWasKeyboard = true;
  };
  const pointer = () => {
    lastInteractionWasKeyboard = false;
  };
  document.addEventListener("keydown", keyboard, true);
  for (const type of ["pointerdown", "mousedown", "touchstart"]) document.addEventListener(type, pointer, true);
}
install();

/** Da chiamare dentro il gestore `onFocus`: vero se l'ultima interazione prima del focus è stata un tasto (es. Tab). */
export const focusCameFromKeyboard = (): boolean => lastInteractionWasKeyboard;
