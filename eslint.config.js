// @ts-check
import babelParser from "@babel/eslint-parser";
import classnames from "eslint-plugin-classnames";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint の設定。書式は Prettier に任せているので、ここではそれ以外の決まりだけを入れる。
 *
 * パーサについて: typescript-eslint は TypeScript 7（Go 実装。JavaScript の API を持たない）に対応していないので、
 * TypeScript とは独立に TS / TSX を読める Babel のパーサを使う。型情報を使うルールは入れられないが、
 * ここで使っているルールは JSX と呼び出しの形しか見ないので足りる。型の検査は `npm run typecheck`（tsc）が担う
 */
export default [
  {
    ignores: ["dist/**", "data/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: [
            ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
          ],
          plugins: ["@babel/plugin-syntax-jsx"],
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { classnames, "react-hooks": reactHooks },
    rules: {
      // Tailwind のクラスは className="a b c" と並べず clsx("a", "b", "c") で 1 つずつ書く
      // https://github.com/fsubal/eslint-plugin-classnames
      // 注意: 自動修正は clsx の import を足さない。--fix の後は tsc（npm run typecheck）で確かめる
      "classnames/prefer-classnames-function": [
        "error",
        { functionName: "clsx" },
      ],
      // 既定の関数名は classNames なので clsx を指定する（prefer-classnames-function と同じ）
      "classnames/one-by-one-arguments": ["error", { functionName: "clsx" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
