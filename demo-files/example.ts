export interface Greeting {
  message: string;
  recipient: string;
}

export function greet({message, recipient}: Greeting): string {
  return `${message}, ${recipient}!`;
}

console.log(greet({message: "Hello", recipient: "md"}));
