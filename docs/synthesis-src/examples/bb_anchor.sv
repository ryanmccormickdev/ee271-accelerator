// What keeps logic alive when the only thing it drives is a memory with no insides?
// Like the course's top.sv, these tops have no output ports. A small MAC reads its
// operand from the memory's q, and its result goes only to the memory's d.
module mem_empty (input logic clk, input logic [15:0] d, output logic [7:0] q);
  // empty body, exactly like synth/macros/array.sv
endmodule

(* blackbox *)
module mem_bb (input logic clk, input logic [15:0] d, output logic [7:0] q);
  // same ports, marked as a black box: a cell whose insides the tool must not assume
endmodule

module top_empty (input logic clk, rst_n);      // memory = empty module
  logic [7:0] x;  logic [15:0] acc;
  mem_empty u_mem (.clk(clk), .d(acc), .q(x));
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) acc <= '0; else acc <= acc + x * x;
endmodule

module top_bb (input logic clk, rst_n);         // memory = black-box cell
  logic [7:0] x;  logic [15:0] acc;
  mem_bb u_mem (.clk(clk), .d(acc), .q(x));
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) acc <= '0; else acc <= acc + x * x;
endmodule

module top_bb_keep (input logic clk, rst_n);    // black-box cell the tool is told to keep
  logic [7:0] x;  logic [15:0] acc;
  (* keep *) mem_bb u_mem (.clk(clk), .d(acc), .q(x));
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) acc <= '0; else acc <= acc + x * x;
endmodule
