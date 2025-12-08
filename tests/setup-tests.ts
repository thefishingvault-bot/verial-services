import "@testing-library/jest-dom";

// Minimal mock for next/image to simplify component rendering in tests
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    const { src, alt, ...rest } = props;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={typeof src === "string" ? src : (src?.src ?? "")} alt={alt} {...rest} />;
  },
}));

// Stub next/navigation notFound to throw, so tests can assert it
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    notFound: () => {
      throw new Error("NOT_FOUND");
    },
  };
});
