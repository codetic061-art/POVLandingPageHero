import { test, expect, type Locator, type Page } from "@playwright/test";

async function openExperience(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
}

async function scrollToProgress(page: Page, progress: number) {
  await page.evaluate(
    (value) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value),
    progress,
  );
  await expect
    .poll(() =>
      page.evaluate(() => scrollY / (document.documentElement.scrollHeight - innerHeight)),
    )
    .toBeCloseTo(progress, 2);
  // Allow ScrollTrigger's rAF update to render after the native scroll event.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function buttonAppearance(button: Locator) {
  return button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: rect.width,
      height: rect.height,
      text: element.textContent,
      styles: Object.fromEntries(
        [
          "backgroundColor",
          "color",
          "border",
          "borderRadius",
          "fontFamily",
          "fontSize",
          "fontWeight",
          "letterSpacing",
          "padding",
          "boxShadow",
          "scale",
        ].map((key) => [key, style[key as keyof CSSStyleDeclaration]]),
      ),
    };
  });
}

async function expectEntranceReady(page: Page) {
  await expect(page.locator(".doorway-renderer")).toHaveAttribute("data-renderer", "three-svg");
  await expect(page.locator(".booking-experience")).toHaveAttribute(
    "data-entrance-unlocked",
    "true",
  );
}

async function assertBookingLayout(page: Page) {
  const cards = await page.locator(".character-card").all();
  const viewport = page.viewportSize()!;
  const button = await page.getByRole("button", { name: "Let's Get Started!" }).boundingBox();
  const field = await page.getByRole("textbox", { name: "Enter your name" }).boundingBox();
  expect(field!.y).toBeGreaterThan(60);
  for (const card of cards) {
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThan(field!.y + field!.height);
    expect(button!.y).toBeGreaterThan(box.y + box.height + 10);
  }
  expect(button!.y + button!.height + 16).toBeLessThan(viewport.height);
  expect(button!.x + button!.width / 2).toBeCloseTo(viewport.width / 2, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Keep scroll restoration native; tests cover a real refresh at the final state.
    history.scrollRestoration = "auto";
  });
  (page as Page & { runtimeErrors: string[] }).runtimeErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { runtimeErrors: string[] }).runtimeErrors).toEqual([]);
});

test("scene images and props are separate named layers with independent geometry", async ({
  page,
}) => {
  await openExperience(page);
  await expect(page.locator("#pov-character-cutouts img[data-scene-layer]")).toHaveCount(4);
  await expect(page.locator("#pov-character-cutouts svg image")).toHaveCount(0);
  await expect(page.locator("#pov-architectural-room > svg[data-scene-layer]")).toHaveCount(11);

  for (const [id, name] of [
    ["left-studio-planter", "Plants / Left planter"],
    ["right-studio-planter", "Plants / Right planter"],
    ["pendant-lamp", "Decor / Pendant lamp"],
    ["right-wall-shelf", "Decor / Shelf, books and small plant"],
    ["central-architectural-door", "Room / Double doorway"],
  ]) {
    expect(
      await page.locator(`#${id}`).evaluate((el) => el.closest("svg")!.getAttribute("data-name")),
    ).toBe(name);
  }

  const stage = (await page.locator(".experience-stage").boundingBox())!;
  const person = page.locator("#characters-left-standing");
  const initialPerson = (await person.boundingBox())!;
  expect(Math.abs(initialPerson.x - (stage.x + (135.9 / 1600) * stage.width))).toBeLessThan(0.1);
  expect(Math.abs(initialPerson.y - (stage.y + (321.4 / 900) * stage.height))).toBeLessThan(0.1);

  const leftPlant = page.locator('svg[data-scene-layer="Plants / Left planter"]');
  const initialPlant = (await leftPlant.boundingBox())!;
  const door = page.locator("#central-architectural-door");
  const initialDoor = (await door.boundingBox())!;
  await person.evaluate((el) => (el.style.transform = "translateX(24px)"));
  expect((await person.boundingBox())!.x - initialPerson.x).toBeCloseTo(24, 1);
  expect((await leftPlant.boundingBox())!.x).toBeCloseTo(initialPlant.x, 1);
  await leftPlant.evaluate((el) => (el.style.transform = "translateX(18px)"));
  expect((await leftPlant.boundingBox())!.x - initialPlant.x).toBeCloseTo(18, 1);
  expect((await door.boundingBox())!.x).toBeCloseTo(initialDoor.x, 1);
  await person.evaluate((el) => el.style.removeProperty("transform"));
  await leftPlant.evaluate((el) => el.style.removeProperty("transform"));

  await scrollToProgress(page, 0.18);
  expect((await person.boundingBox())!.x).toBeLessThan(initialPerson.x);
  await scrollToProgress(page, 0);
  expect((await person.boundingBox())!.x).toBeCloseTo(initialPerson.x, 1);
});

test("one pinned, reversible timeline preserves the original CTA and closed doors", async ({
  page,
}, testInfo) => {
  await openExperience(page);
  const button = page.getByRole("button", { name: "Let's Get Started!" });
  const originalElement = await button.elementHandle();
  const appearance = await buttonAppearance(button);
  const initialButton = (await button.boundingBox())!;
  const initialLeft = (await page.locator('[data-character-side="left"]').boundingBox())!;
  const initialRight = (await page.locator('[data-character-side="right"]').boundingBox())!;
  const slogan = page.getByRole("heading", { name: "We design experiences." });
  const initialSlogan = (await slogan.boundingBox())!;

  expect(appearance.styles.backgroundColor).toBe("rgb(66, 87, 245)");
  expect(appearance.styles.borderRadius).toBe("12px");
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", true);
  expect(initialButton.y - (initialSlogan.y + initialSlogan.height)).toBeGreaterThanOrEqual(55);
  expect(initialButton.y + initialButton.height + 16).toBeLessThan(page.viewportSize()!.height);
  if (testInfo.project.name === "desktop") {
    // Keep the original button dimensions/style, with the requested lower Hero position.
    expect(initialButton.x).toBeCloseTo(611.5078, 2);
    expect(initialButton.y).toBeGreaterThan(525);
    expect(initialSlogan.y).toBeLessThan(445);
    expect(appearance.width).toBeCloseTo(216.984375, 2);
    expect(appearance.height).toBeCloseTo(48.171875, 2);
  }
  const range = await page.evaluate(
    () => (document.documentElement.scrollHeight - innerHeight) / innerHeight,
  );
  expect(range).toBeCloseTo(testInfo.project.name === "mobile" ? 3.8 : 4, 2);

  await scrollToProgress(page, 0.18);
  expect((await page.locator('[data-character-side="left"]').boundingBox())!.x).toBeLessThan(
    initialLeft.x,
  );
  expect((await page.locator('[data-character-side="right"]').boundingBox())!.x).toBeGreaterThan(
    initialRight.x,
  );
  expect((await slogan.boundingBox())!.y).toBeLessThan(initialSlogan.y);
  expect((await button.boundingBox())!.y).toBeGreaterThan(initialButton.y);
  expect((await page.locator(".booking-experience").boundingBox())!.y).toBeCloseTo(0, 1);

  await scrollToProgress(page, 0.7);
  for (const option of ["male", "female"]) {
    const opacity = await page
      .locator(`[data-booking-card="${option}"]`)
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    const box = (await page.locator(`[data-booking-card="${option}"]`).boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(0);
    expect(box.x).toBeLessThan(page.viewportSize()!.width);
  }
  await expect(page.locator("[data-hero-brand]").first()).toHaveCSS("opacity", "0");
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", true);

  await scrollToProgress(page, 1);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await assertBookingLayout(page);
  expect(await buttonAppearance(button)).toEqual(appearance);
  expect(
    await originalElement!.evaluate(
      (el) => el === document.querySelector(".experience-cta button"),
    ),
  ).toBe(true);
  const cameraScale = await page
    .locator(".office-camera")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  expect(cameraScale).toBeGreaterThan(1.25);
  for (const leaf of ["#door-leaf-left", "#door-leaf-right"]) {
    await expect(page.locator(leaf)).toHaveCSS("transform", "none");
  }
  await expect(page.getByRole("button")).toHaveCount(1);

  await scrollToProgress(page, 0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", true);
  await expect(page.locator(".character-card").first()).toHaveCSS("visibility", "hidden");
  await expect(slogan).toHaveCSS("opacity", "1");
  expect((await button.boundingBox())!.y).toBeCloseTo(initialButton.y, 2);
  expect(await buttonAppearance(button)).toEqual(appearance);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
});

test("the input, native radio keyboard controls, and local-only submit work", async ({ page }) => {
  await openExperience(page);
  await scrollToProgress(page, 1);
  const name = page.getByRole("textbox", { name: "Enter your name" });
  const male = page.getByRole("radio", { name: "Male", exact: true });
  const female = page.getByRole("radio", { name: "Female", exact: true });
  const button = page.getByRole("button", { name: "Let's Get Started!" });

  await button.click();
  await expect(name).toBeFocused();
  expect(await name.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await name.fill("Taylor");
  await name.press("Tab");
  await expect(male).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(female).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(male).toBeChecked();
  await expect(female).not.toBeChecked();
  await expect(male.locator("..").locator(".character-card-surface")).toHaveCSS(
    "border-color",
    "rgb(66, 87, 245)",
  );
  await male.press("Tab");
  await expect(button).toBeFocused();
  await button.press("Enter");
  await expectEntranceReady(page);
  await expect(page.getByRole("status")).toHaveText("Taylor, scroll down to open the doors.");
  expect(new URL(page.url()).pathname).toBe("/");
  await page.getByRole("button", { name: "Back to selection" }).click();

  await female.check();
  await expect(male).not.toBeChecked();
  await expect(page.getByRole("status")).toBeEmpty();
  await name.focus();
  await scrollToProgress(page, 0);
  await expect(button).toBeFocused();
  await expect(page.getByRole("status")).not.toBeVisible();
  await scrollToProgress(page, 1);
  await expect(name).toHaveValue("Taylor");
  await expect(female).toBeChecked();

  await name.fill("   ");
  await button.click();
  expect(await name.evaluate((el: HTMLInputElement) => el.validity.customError)).toBe(true);
  await name.fill("Sam");
  await button.click();
  await expectEntranceReady(page);
  await expect(page.getByRole("status")).toContainText("Sam, scroll down to open the doors.");
});

test("the Hero CTA reaches the same form without navigation or replacing the button", async ({
  page,
}) => {
  await openExperience(page);
  const button = page.getByRole("button", { name: "Let's Get Started!" });
  const original = await button.elementHandle();
  await button.click();
  await expect(page.getByRole("textbox", { name: "Enter your name" })).toBeFocused();
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  expect(
    await original!.evaluate((el) => el === document.querySelector(".experience-cta button")),
  ).toBe(true);
  expect(new URL(page.url()).pathname).toBe("/");
});

test("the Hero CTA stays below the slogan with a delayed logo and resizing before scrolling", async ({
  page,
}) => {
  await page.route("**/pov-logo.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  async function assertHeroStack() {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const button = document.querySelector(".experience-cta button")!.getBoundingClientRect();
          const anchor = document.querySelector(".hero-cta-anchor")!.getBoundingClientRect();
          const slogan = document.querySelector("h1")!.getBoundingClientRect();
          return {
            aligned: Math.abs(button.top - anchor.top) < 0.1,
            belowSlogan: button.top - slogan.bottom >= 55,
            scroll: scrollY,
          };
        }),
      )
      .toEqual({ aligned: true, belowSlogan: true, scroll: 0 });
  }

  await assertHeroStack();
  await expect(page.locator("img[data-hero-brand]")).toHaveJSProperty("complete", true);
  await page.evaluate(() => document.fonts.ready);
  await assertHeroStack();

  // Include the annotated preview size, then resize without ever starting buttonMove.
  for (const viewport of [
    { width: 1000, height: 670 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() => page.locator(".booking-experience").evaluate((el) => el.clientWidth))
      .toBe(viewport.width);
    await assertHeroStack();
    await expect(page.locator(".pin-spacer")).toHaveCount(1);
  }

  const button = page.getByRole("button", { name: "Let's Get Started!" });
  const initialAppearance = await buttonAppearance(button);
  await scrollToProgress(page, 1);
  await assertBookingLayout(page);
  expect(await buttonAppearance(button)).toEqual(initialAppearance);
  await scrollToProgress(page, 0);
  await assertHeroStack();
});

test("refresh and resize retain a usable final layout with only one pin", async ({ page }) => {
  await openExperience(page);
  await scrollToProgress(page, 1);
  await page.reload();
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await assertBookingLayout(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(() => page.locator(".booking-experience").evaluate((el) => el.clientWidth))
    .toBe(1024);
  await expect
    .poll(() =>
      page.evaluate(() => (document.documentElement.scrollHeight - innerHeight) / innerHeight),
    )
    .toBeCloseTo(4, 2);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await assertBookingLayout(page);
  await page.setViewportSize({ width: 320, height: 667 });
  await expect
    .poll(() => page.locator(".booking-experience").evaluate((el) => el.clientWidth))
    .toBe(320);
  await expect
    .poll(() =>
      page.evaluate(() => (document.documentElement.scrollHeight - innerHeight) / innerHeight),
    )
    .toBeCloseTo(3.8, 2);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await assertBookingLayout(page);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
});

test("reduced motion is a usable non-pinned document, including a live preference change", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  const hero = (await page.locator(".experience-hero").boundingBox())!;
  const form = (await page.locator(".booking-interface").boundingBox())!;
  const button = page.getByRole("button", { name: "Let's Get Started!" });
  expect(form.y).toBeGreaterThanOrEqual(hero.height);
  const name = page.getByRole("textbox", { name: "Enter your name" });
  await name.fill("Alex");
  await page.getByRole("radio", { name: "Female", exact: true }).check();
  await button.click();
  await expectEntranceReady(page);
  await expect(page.getByRole("status")).toContainText("Alex, your doorway preview is ready.");
  await expect(page.locator(".doorway-renderer")).toHaveAttribute("data-progress", "1.0000");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to selection" }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await scrollToProgress(page, 1);
  await assertBookingLayout(page);
  await expect(name).toHaveValue("Alex");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await expect(button).toHaveCount(1);
});

test("short landscape screens use the unpinned fallback", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  const name = page.getByRole("textbox", { name: "Enter your name" });
  await name.fill("Casey");
  await page.getByRole("radio", { name: "Male", exact: true }).check();
  await page.getByRole("button", { name: "Let's Get Started!" }).click();
  await expectEntranceReady(page);
  await expect(page.getByRole("status")).toContainText("Casey, your doorway preview is ready.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
});

test("valid selection unlocks one reversible 3D doorway phase with progressive lines", async ({
  page,
}) => {
  const engineRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("createDoorwayScene")) engineRequests.push(request.url());
  });
  await openExperience(page);
  await scrollToProgress(page, 1);
  const initialRange = await page.evaluate(
    () => document.documentElement.scrollHeight - innerHeight,
  );
  const button = page.getByRole("button", { name: "Let's Get Started!" });
  const originalButton = await button.elementHandle();
  await expect(page.locator(".doorway-renderer")).toHaveCount(0);
  expect(engineRequests).toHaveLength(0);
  await button.click();
  await expect(page.getByRole("textbox", { name: "Enter your name" })).toBeFocused();
  await expect(page.locator(".doorway-renderer")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Enter your name" }).fill("Nour");
  await page.getByRole("radio", { name: "Female", exact: true }).check();
  await button.click();
  await expectEntranceReady(page);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  expect(engineRequests.length).toBeGreaterThan(0);
  const extendedRange = await page.evaluate(
    () => document.documentElement.scrollHeight - innerHeight,
  );
  expect(extendedRange / initialRange).toBeCloseTo(1.8, 2);
  const scene = page.locator(".doorway-renderer");
  await expect(scene).toHaveAttribute("data-door-angle", "0.00");
  const startZ = Number(await scene.getAttribute("data-camera-z"));

  await scrollToProgress(page, 12 / 18);
  const firstAngle = Number(await scene.getAttribute("data-door-angle"));
  const firstLines = Number(await scene.getAttribute("data-drawn-segments"));
  expect(firstAngle).toBeGreaterThan(0);
  expect(firstAngle).toBeLessThan(90);
  expect(firstLines).toBeGreaterThan(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", true);
  await expect(page.locator(".entrance-overlay")).toHaveCSS("opacity", "1");

  await scrollToProgress(page, 1);
  expect(Number(await scene.getAttribute("data-door-angle"))).toBeGreaterThan(99);
  expect(Number(await scene.getAttribute("data-camera-z"))).toBeCloseTo(-0.12, 2);
  expect(Number(await scene.getAttribute("data-camera-z"))).toBeLessThan(startZ);
  expect(Number(await scene.getAttribute("data-drawn-segments"))).toBeGreaterThan(firstLines);
  await expect(scene.locator("svg")).toHaveCount(1);
  await expect(scene.locator("img, image, canvas")).toHaveCount(0);
  await expect(page.locator(".office-camera")).toHaveCSS("opacity", "0");
  expect(
    await originalButton!.evaluate((el) => el === document.querySelector(".experience-cta button")),
  ).toBe(true);
  const colors = await scene
    .locator("path")
    .evaluateAll((paths) => [
      ...new Set(
        paths.map((path) => getComputedStyle(path).stroke).filter((color) => color !== "none"),
      ),
    ]);
  expect(colors.every((color) => ["rgb(41, 43, 46)", "rgb(66, 87, 245)"].includes(color))).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );

  await scrollToProgress(page, 12 / 18);
  expect(Number(await scene.getAttribute("data-door-angle"))).toBeCloseTo(firstAngle, 0);
  expect(Number(await scene.getAttribute("data-drawn-segments"))).toBeCloseTo(firstLines, 0);
  await scrollToProgress(page, 10 / 18);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await expect(scene).toHaveAttribute("data-door-angle", "0.00");
  await expect(page.getByRole("textbox", { name: "Enter your name" })).toHaveValue("Nour");
  await expect(page.getByRole("radio", { name: "Female", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Back to selection" }).click();
  await expect(scene).toHaveCount(0);
});

test("3D resize, preference changes, back, and re-entry keep one scene and one pin", async ({
  page,
}) => {
  await openExperience(page);
  await scrollToProgress(page, 1);
  await page.getByRole("textbox", { name: "Enter your name" }).fill("Rami");
  await page.getByRole("radio", { name: "Male", exact: true }).check();
  await page.getByRole("button", { name: "Let's Get Started!" }).click();
  await expectEntranceReady(page);
  await scrollToProgress(page, 16 / 18);
  const progress = Number(await page.locator(".doorway-renderer").getAttribute("data-progress"));
  await page.setViewportSize({ width: 430, height: 932 });
  await expect
    .poll(() => page.locator(".doorway-renderer").evaluate((el) => el.clientWidth))
    .toBe(430);
  await expect
    .poll(async () => Number(await page.locator(".doorway-renderer").getAttribute("data-progress")))
    .toBeCloseTo(progress, 2);
  await expect(page.locator(".doorway-renderer > svg")).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".doorway-renderer")).toHaveAttribute("data-progress", "1.0000");
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await expectEntranceReady(page);
  await expect(page.locator(".doorway-renderer > svg")).toHaveCount(1);
  await scrollToProgress(page, 1);
  await page.getByRole("button", { name: "Back to selection" }).click();
  await expect(page.locator(".doorway-renderer")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Enter your name" })).toHaveValue("Rami");
  await expect(page.getByRole("radio", { name: "Male", exact: true })).toBeChecked();
  const range = await page.evaluate(
    () => (document.documentElement.scrollHeight - innerHeight) / innerHeight,
  );
  expect(range).toBeCloseTo(3.8, 2);
  await page.getByRole("button", { name: "Let's Get Started!" }).click();
  await expectEntranceReady(page);
  await expect(page.locator(".doorway-renderer > svg")).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await expect(page.locator(".doorway-renderer")).toHaveCount(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
});

test("a failed 3D import preserves the form and offers a working reload recovery", async ({
  page,
}) => {
  await page.route("**/createDoorwayScene*", (route) => route.abort("failed"));
  await openExperience(page);
  await scrollToProgress(page, 1);
  await page.getByRole("textbox", { name: "Enter your name" }).fill("Salma");
  await page.getByRole("radio", { name: "Female", exact: true }).check();
  await page.getByRole("button", { name: "Let's Get Started!" }).click();
  await expect(page.getByRole("status")).toContainText("The doorway could not load");
  await expect(page.locator(".doorway-renderer")).toHaveCount(0);
  await expect(page.locator(".booking-interface")).toHaveJSProperty("inert", false);
  await expect(page.getByRole("textbox", { name: "Enter your name" })).toHaveValue("Salma");
  await page.unroute("**/createDoorwayScene*");
  // Browsers cache rejected ES module imports; a fresh document clears that cache.
  await page.getByRole("button", { name: "Reload page" }).click();
  await page.waitForLoadState();
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  await scrollToProgress(page, 1);
  await page.getByRole("textbox", { name: "Enter your name" }).fill("Salma");
  await page.getByRole("radio", { name: "Female", exact: true }).check();
  await page.getByRole("button", { name: "Let's Get Started!" }).click();
  await expectEntranceReady(page);
});
