# Faust circuits

Having explored signals, we now describe Faust circuits, which take signals as input and produce signals as output.
As with signals, we will first describe how circuits are constructed and then their semantics as signal processors.

## Faust Circuits as formal expressions

A Faust circuit $C∈ ℂ$ is made of primitive elements (predefined audio circuits) assembled using a set of five composition operators, and the *ondemand* operator.


```adt
Expr ::= Const(c)            (* c ∈ ℝ *)
       | Vec(v)
       | Op(o, Expr, Expr)
```


```adt
C  ::= k   (* k ∈  ℝ *)
|  u | \star |  @ |   ! |  _
| C₁:C₂ | C₁,C₂ 
| C₁<:C₂ | C₁:>C₂
| C₁∼ C₂ | od(C)
```

_Primitives_ elements are either:

- $k$ numbers (integer or real);
- $u$ user interface elements (sliders, buttons, etc.);
- $\star$ any numerical operation;
- $@$ the delay operation;
- $\_$ underscore, the identity circuit (a _perfect_ cable);
- $\ !$ cut, the termination circuit.

More complex audio circuits are obtained by assembling primitive ones using five binary composition operations and the unary operator _ondemand_ :

- $C_1<:C_2$ is a _composition split_, the outputs of $C_1$ are distributed over the inputs of $C_2$ ;
- $C_1:>C_2$ is a _merge composition_, the outputs of $C_1$ are summed to form the inputs of $C_2$ ;
- $C_1:C_2$ is a _sequential composition_, the outputs of $C_1$ are propagated to the inputs of $C_2$ ;
- $C_1,C_2$ is a _parallel composition_, the inputs are those of $C_1$ and $C_2$ and so are the outputs ;
- $C_1\sim C_2$ is a _recursive composition_, the outputs of $C_1$ are fed back to the inputs of $C_2$ and vice versa ;
- $\od{C}$ is the _ondemand_ version of $C$.

## Well-formed circuits, number of inputs and outputs

Four of the five composition operations impose constraints on the number of inputs-outputs. The _well-formed circuits_ are those that respect these constraints. The following inference rules $\io{C}:n -> m$ allows us to compute the number of inputs-outputs of a well-formed circuit $C$ according to the number of inputs-outputs of its components.


### Primitives
#### Constant
A number $k$ denotes an elementary circuit with no input and one output.
$$
\inference{(num)}{}{\io{k}:0 \rightarrow 1} 
$$ 


#### Control

A user interface element $u$ denotes an elementary circuit with no input and one output.
$$
\inference{(ctrl)}{}{\io{u}:0 \rightarrow 1} 
$$ 

#### Numerical operation
The $\star$ symbol denotes any numerical operation on a circuit with $n$ inputs and one output. The number $n$ depends on the nature of the operation, and will typically be 1 or 2.
$$
\inference{(nop)}{}{\io{\star}:n \rightarrow 1} 
$$ 


#### Delay
A delay primitive $@$ denotes a circuit with two inputs and one output.

$$
\inference{(delay)}{}{\io{@}:2 \rightarrow 1} 
$$ 


#### Cable
The cable has one input and one output.
$$
\inference{(cable)}{}{\io{\_}:1 \rightarrow 1} 
$$ 


#### Cut
The cut has one input and no output.
$$
\inference{(cut)}{}{\io{!}:1 \rightarrow 0} 
$$ 

### Compositions

$$\sems{20}$$
#### Sequential composition
To be well-formed, the sequential composition $C_1:C_2$ requires that the number of outputs of $C_1$ is identical to the number of inputs of $C_2$.
$$
\inference{(seq)}{\io{C_1}:m\rightarrow n\ \;\; \io{C_2}:n\rightarrow p}{\io{C_1:C_2}:m \rightarrow p} 
$$ 


#### Parallel composition
There are no particular constraints on the parallel composition.
$$
\inference{(par)}{\io{C_1}:m\rightarrow n\ \;\; \io{C_2}:p\rightarrow q}{\io{C_1,C_2}:m+p \rightarrow n+q} 
$$ 

#### Split composition

To be well-formed, the split composition $C_1<:C_2$ requires that the number of inputs of $C_2$ is a multiple of the number of outputs of $C_1$.
$$
\inference{(split)}{\io{C_1}:m\rightarrow n\ \;\; \io{C_2}:n.k\rightarrow p}{\io{C_1<:C_2}:m \rightarrow p} 
$$ 

#### Merge composition

To be well-formed, the merge composition $C_1:>C_2$ requires that the number of outputs of $C_1$ is a multiple of the number of inputs of $C_2$.
$$
\inference{(merge)}{\io{C_1}:m\rightarrow k.n\ \;\; \io{C_2}:n\rightarrow p}{\io{C_1:>C_2}:m \rightarrow p} 
$$ 

#### Recursive Composition

To be well-formed, the recursive composition $C1\sim C2$ assumes that the number of outputs of $C_1$ is greater than or equal to the number of inputs of $C_2$, and that the number of inputs of $C_1$ is greater than or equal to the number of outputs of $C_2$.
$$
\inference{(rec)}{\io{C_1}:r+n\rightarrow q+m\ \;\; \io{C_2}:q\rightarrow r}{\io{C_1\sim C_2}:n \rightarrow q+m} 
$$ 

#### Ondemand

There are no particular constraints on the _ondemand_ construction that adds an additional clock input.
$$
\inference{(od)}{\io{C}:m\rightarrow n}{\io{\od{C}}:m+1 \rightarrow n} 
$$ 
